import * as fs from 'fs'
import * as path from 'path'
import {compileZephyrFileToWasmModule, emitWasmModule} from './wasm'

interface WasmCliOptions {
	inputPath: string,
	outputPath: string | null,
}

interface WasmCliParseState extends WasmCliOptions {
	skipNext: boolean,
}

function parseArgs(args: string[]): WasmCliOptions {
	if (args.length === 0) {
		throw new Error('Не передан путь к .zph файлу')
	}
	const initialOptions: WasmCliParseState = {
		inputPath: '',
		outputPath: null,
		skipNext: false,
	}
	const parsed = args.reduce<WasmCliParseState>((acc, arg, index, arr) => {
		if (acc.skipNext) {
			return {
				...acc,
				skipNext: false,
			}
		}
		if (arg === '--out') {
			const nextArg = arr[index + 1]
			if (nextArg === undefined) {
				throw new Error('Ожидался путь после --out')
			}

			return {
				...acc,
				outputPath: nextArg,
				skipNext: true,
			}
		}
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
	}, initialOptions)
	if (parsed.inputPath.length === 0) {
		throw new Error('Не передан путь к .zph файлу')
	}

	return {
		inputPath: parsed.inputPath,
		outputPath: parsed.outputPath,
	}
}

function resolveFromCwd(rawPath: string): string {
	return path.resolve(process.cwd(), rawPath)
}

function defaultWasmPath(inputPath: string): string {
	const parsed = path.parse(inputPath)

	return path.join(parsed.dir, `${parsed.name}.wasm`)
}

function main(): void {
	const options = parseArgs(process.argv.slice(2))
	const inputPath = resolveFromCwd(options.inputPath)
	const outputPath = options.outputPath === null
		? defaultWasmPath(inputPath)
		: resolveFromCwd(options.outputPath)
	const module = compileZephyrFileToWasmModule(inputPath)
	const bytes = emitWasmModule(module)
	fs.mkdirSync(path.dirname(outputPath), {recursive: true})
	fs.writeFileSync(outputPath, bytes)
	console.log(`Wasm: ${outputPath}`)
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
