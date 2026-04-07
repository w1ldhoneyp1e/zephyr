import * as fs from 'fs'
import * as path from 'path'
import {
	type ConstantPoolItem,
	type Instruction,
	type Value,
	type VmFunctionTemplate,
	type VmProgram,
} from '../vm/types'
import {formatValue, Vm} from '../vm/Vm'
import {Compiler} from './Compiler'

interface CliOptions {
	inputPath: string,
	emitBytecode: boolean,
	outputPath: string | null,
	runProgram: boolean,
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
	let inputPath = ''
	let emitBytecode = false
	let outputPath: string | null = null
	let runProgram = true
	let idx = 0
	while (idx < args.length) {
		const arg = args[idx]
		if (arg === '--emit-bc') {
			emitBytecode = true
			idx++
			continue
		}
		if (arg === '--no-run') {
			runProgram = false
			idx++
			continue
		}
		if (arg === '--out') {
			const nextArg = args[idx + 1]
			if (nextArg === undefined) {
				throw new Error('Ожидался путь после --out')
			}
			outputPath = nextArg
			idx += 2
			continue
		}
		if (arg.startsWith('--')) {
			throw new Error(`Неизвестный флаг: ${arg}`)
		}
		if (inputPath.length > 0) {
			throw new Error('Передано больше одного входного файла')
		}
		inputPath = arg
		idx++
	}
	if (inputPath.length === 0) {
		throw new Error('Не передан путь к файлу')
	}

	return {
		inputPath,
		emitBytecode,
		outputPath,
		runProgram,
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
	const source = fs.readFileSync(filePath, 'utf-8')
	const compiler = new Compiler()
	const programs = compiler.compile(source)
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
