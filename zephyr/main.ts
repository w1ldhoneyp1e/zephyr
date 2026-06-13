import * as fs from 'fs'
import * as path from 'path'
import {formatValue, Vm} from '../vm'
import {
	type ConstantPoolItem,
	type Instruction,
	type VmFunctionTemplate,
	type VmProgram,
} from '../vm/types'
import {Compiler} from './Compiler'
import {diagnosticToMessage} from './diagnostics'
import {match} from './utils'
import {compileZephyrFileToWasmModule, emitWasmModule} from './wasm'

type CliCommand = 'run' | 'compile' | 'check'
type CompileTarget = 'bytecode' | 'wasm'

interface CliOptions {
	command: CliCommand,
	inputPath: string,
	emitBytecode: boolean,
	emitWasm: boolean,
	target: CompileTarget | null,
	jsonOutput: boolean,
	outputPath: string | null,
	runProgram: boolean,
	checkOnly: boolean,
	sourceStdin: boolean,
}

interface CliParseState extends CliOptions {
	skipNext: boolean,
}

function resolveInputPath(rawPath: string): string {
	const fromCwd = path.resolve(process.cwd(), rawPath)
	const fromRoot = path.resolve(process.cwd(), '../..', rawPath)

	return fs.existsSync(fromCwd)
		? fromCwd
		: fromRoot
}

function defaultBytecodePath(inputPath: string): string {
	const parsed = path.parse(inputPath)

	return path.join(parsed.dir, `${parsed.name}.zphbc`)
}

function defaultWasmPath(inputPath: string): string {
	const parsed = path.parse(inputPath)

	return path.join(parsed.dir, `${parsed.name}.wasm`)
}

function parseArgs(args: string[]): CliOptions {
	if (args.length === 0) {
		throw new Error('Не передан путь к файлу')
	}
	const command = getCliCommand(args[0])
	const initialOptions: CliParseState = {
		command,
		inputPath: '',
		emitBytecode: false,
		emitWasm: false,
		target: null,
		jsonOutput: false,
		outputPath: null,
		runProgram: true,
		checkOnly: false,
		sourceStdin: false,
		skipNext: false,
	}

	const commandArgs = parseCommandArgs(args)
	const parsed = commandArgs.reduce<CliParseState>((acc, arg, index, arr) => {
		if (acc.skipNext) {
			return {
				...acc,
				skipNext: false,
			}
		}

		return match(arg, {
			'--emit-bc': {
				...acc,
				emitBytecode: true,
			},
			'--emit-wasm': {
				...acc,
				emitWasm: true,
				target: 'wasm',
				runProgram: false,
			},
			'--check': {
				...acc,
				command: 'check',
				checkOnly: true,
				runProgram: false,
			},
			'--target': (() => {
				const nextArg = arr[index + 1]
				if (nextArg === undefined) {
					throw new Error('Ожидался target после --target')
				}
				if (nextArg !== 'bytecode' && nextArg !== 'wasm') {
					throw new Error(`Неизвестный target: ${nextArg}`)
				}

				return {
					...acc,
					target: nextArg,
					skipNext: true,
				}
			}),
			'--json': {
				...acc,
				jsonOutput: true,
			},
			'--no-run': {
				...acc,
				runProgram: false,
			},
			'--source-stdin': {
				...acc,
				sourceStdin: true,
			},
			'--out': (() => {
				const nextArg = arr[index + 1]
				if (nextArg === undefined) {
					throw new Error('Ожидался путь после --out')
				}

				return {
					...acc,
					outputPath: nextArg,
					skipNext: true,
				}
			}),
			default: (() => {
				if (arg.startsWith('--')) {
					throw new Error(`Неизвестный флаг: ${arg}`)
				}
				if (acc.inputPath.length > 0) {
					throw new Error('Передано больше одного входного файла')
				}

				return {
					...acc,
					inputPath: arg,
				}
			}),
		})
	}, initialOptions)

	if (parsed.inputPath.length === 0) {
		throw new Error('Не передан путь к файлу')
	}

	return {
		command: parsed.command,
		inputPath: parsed.inputPath,
		emitBytecode: parsed.emitBytecode,
		emitWasm: parsed.emitWasm,
		target: parsed.target,
		jsonOutput: parsed.jsonOutput,
		outputPath: parsed.outputPath,
		runProgram: parsed.runProgram,
		checkOnly: parsed.checkOnly,
		sourceStdin: parsed.sourceStdin,
	}
}

function parseCommandArgs(args: string[]): string[] {
	const [firstArg, ...rest] = args
	if (firstArg === 'compile') {
		return [
			'--no-run',
			...rest,
		]
	}
	if (firstArg === 'run') {
		return rest
	}
	if (firstArg === 'check') {
		return [
			'--check',
			...rest,
		]
	}

	return args
}

function getCliCommand(firstArg: string): CliCommand {
	switch (firstArg) {
		case 'compile':
			return 'compile'
		case 'check':
			return 'check'
		case 'run':
		default:
			return 'run'
	}
}

function readStdin(): string {
	return fs.readFileSync(0, 'utf-8')
}

function serializeConstant(value: ConstantPoolItem): string {
	if (value === null) {
		return 'nil'
	}
	if (typeof value === 'boolean') {
		return value
			? 'bool true'
			: 'bool false'
	}
	if (typeof value === 'number') {
		return `number ${value}`
	}
	if (typeof value === 'string') {
		return `string ${value}`
	}
	if (typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'function') {
		const fn = value as VmFunctionTemplate

		return `function ${fn.programIndex} ${fn.arity} ${fn.upvalueCount}`
	}
	if (typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'struct') {
		return `class ${value.name} ${value.baseClass?.name ?? '-'} ${value.fields.join(' ')}`
	}

	return `string ${JSON.stringify(value)}`
}

function serializeInstruction(instruction: Instruction): string {
	if (instruction.op === 'closure') {
		const parts = [
			instruction.op,
			String(instruction.functionConstIndex),
			String(instruction.upvalues.length),
		]
		for (const uv of instruction.upvalues) {
			parts.push(uv.isLocal
				? '1'
				: '0')
			parts.push(String(uv.index))
		}

		return parts.join(' ')
	}
	if ('arg' in instruction) {
		return `${instruction.op} ${instruction.arg}`
	}

	return instruction.op
}

function serializeAllPrograms(programs: VmProgram[]): string {
	return programs.map(serializeProgram).join('\n')
}

function serializeProgram(program: VmProgram): string {
	const lines: string[] = []
	lines.push('.def')
	lines.push(`.name ${program.name}`)
	lines.push(`.argc ${program.argc}`)
	lines.push(`.locals ${program.localsCount}`)
	lines.push('.constants')
	for (const constant of program.constants) {
		lines.push(serializeConstant(constant))
	}
	lines.push('.code')
	for (const instruction of program.instructions) {
		lines.push(serializeInstruction(instruction))
	}
	lines.push('.end_def')
	lines.push('')

	return lines.join('\n')
}

function main(): void {
	const options = parseArgs(process.argv.slice(2))
	const filePath = resolveInputPath(options.inputPath)
	const compiler = new Compiler()
	if (options.checkOnly) {
		const checkResult = options.sourceStdin
			? compiler.checkSource(readStdin(), filePath)
			: compiler.checkPath(filePath)
		if (options.jsonOutput) {
			console.log(JSON.stringify(checkResult))
		}
		else if (!checkResult.ok) {
			for (const diagnostic of checkResult.diagnostics) {
				console.error(diagnosticToMessage(diagnostic))
			}
		}
		if (!checkResult.ok) {
			process.exit(1)
		}
		return
	}
	const compileTarget = options.target ?? (options.emitWasm
		? 'wasm'
		: options.emitBytecode || options.command === 'compile'
			? 'bytecode'
			: null)
	if (compileTarget === 'wasm') {
		const outPath = options.outputPath === null
			? defaultWasmPath(filePath)
			: path.resolve(process.cwd(), options.outputPath)
		const wasmModule = compileZephyrFileToWasmModule(filePath)
		const wasmBytes = emitWasmModule(wasmModule)
		fs.mkdirSync(path.dirname(outPath), {recursive: true})
		fs.writeFileSync(outPath, wasmBytes)
		console.log(`Wasm: ${outPath}`)
		return
	}
	const compileResult = compiler.compilePath(filePath)
	if (!compileResult.ok) {
		if (options.jsonOutput) {
			console.log(JSON.stringify(compileResult))
			process.exit(1)
		}
		for (const diagnostic of compileResult.diagnostics) {
			console.error(diagnosticToMessage(diagnostic))
		}
		process.exit(1)
	}
	const programs = compileResult.programs
	if (options.emitBytecode || compileTarget === 'bytecode') {
		const outPath = options.outputPath === null
			? defaultBytecodePath(filePath)
			: path.resolve(process.cwd(), options.outputPath)
		const bytecode = serializeAllPrograms(programs)
		fs.writeFileSync(outPath, bytecode)
		console.log(`Bytecode: ${outPath}`)
	}
	if (!options.runProgram) {
		return
	}
	const vm = new Vm()
	vm.load(programs)
	const result = vm.run()
	if (result !== null) {
		console.log(formatValue(result))
	}
}

try {
	main()
}
catch (error) {
	console.error(error instanceof Error
		? error.message
		: String(error))
	process.exit(1)
}
