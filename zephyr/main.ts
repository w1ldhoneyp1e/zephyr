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
import {match} from './utils'

interface CliOptions {
	inputPath: string,
	emitBytecode: boolean,
	outputPath: string | null,
	runProgram: boolean,
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

function parseArgs(args: string[]): CliOptions {
	if (args.length === 0) {
		throw new Error('Не передан путь к файлу')
	}
	const initialOptions: CliParseState = {
		inputPath: '',
		emitBytecode: false,
		outputPath: null,
		runProgram: true,
		skipNext: false,
	}

	const parsed = args.reduce<CliParseState>((acc, arg, index, arr) => {
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
			'--no-run': {
				...acc,
				runProgram: false,
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
		inputPath: parsed.inputPath,
		emitBytecode: parsed.emitBytecode,
		outputPath: parsed.outputPath,
		runProgram: parsed.runProgram,
	}
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
	const programs = compiler.run(filePath)
	if (options.emitBytecode) {
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

main()
