import {compileZephyrFileToWasmModule, emitWasmModule} from '../../zephyr/wasm'

interface WebAssemblyRuntime {
	compile: (bytes: Uint8Array) => Promise<unknown>,
	instantiate: (module: unknown) => Promise<{
		exports: Record<string, unknown>,
	}>,
}

interface TableRuntimeModule {
	ROW_LAYOUT: {
		size: number,
	},
	createObjectRows: (count: number) => RowObject[],
	createTableAggregateRuntime: (instance: WebAssemblyInstance) => TableAggregateRuntime,
	createTypedRows: (count: number) => {
		amounts: Float64Array,
		active: Int32Array,
	},
	sumObjectRows: (rows: RowObject[]) => number,
	sumTypedRows: (amounts: Float64Array, active: Int32Array) => number,
}

interface WebAssemblyInstance {
	exports: Record<string, unknown>,
}

interface TableAggregateRuntime {
	fillRows: (count: number) => void,
	sumActiveAmount: (count: number) => number,
}

interface RowObject {
	id: number,
	amount: number,
	active: boolean,
}

const ROW_COUNT = 5_000_000
const BASE_PTR = 4096
const SOURCE_PATH = 'examples/wasm_table_aggregate/table_aggregate.zph'
const RUNTIME_PATH = './table-runtime.js'

async function main(): Promise<void> {
	const runtimeModule = await import(RUNTIME_PATH) as TableRuntimeModule
	const wasm = (globalThis as unknown as {WebAssembly: WebAssemblyRuntime}).WebAssembly
	const sourceModule = compileZephyrFileToWasmModule(SOURCE_PATH)
	const module = {
		...sourceModule,
		memory: {
			minPages: Math.ceil((BASE_PTR + ROW_COUNT * runtimeModule.ROW_LAYOUT.size) / 65536),
			exportName: 'memory',
		},
	}
	const instance = await wasm.instantiate(await wasm.compile(emitWasmModule(module)))
	const tableRuntime = runtimeModule.createTableAggregateRuntime(instance)

	const objectRows = runtimeModule.createObjectRows(ROW_COUNT)
	const typedRows = runtimeModule.createTypedRows(ROW_COUNT)
	tableRuntime.fillRows(ROW_COUNT)

	const jsObjects = measure('JS object array', () => runtimeModule.sumObjectRows(objectRows))
	const jsTyped = measure('JS typed arrays', () => runtimeModule.sumTypedRows(typedRows.amounts, typedRows.active))
	const wasmPacked = measure('Zephyr Wasm packed records', () => tableRuntime.sumActiveAmount(ROW_COUNT))

	assertClose(jsObjects.result, jsTyped.result, 'JS object and typed array results differ')
	assertClose(jsObjects.result, wasmPacked.result, 'JS object and Wasm results differ')

	console.log(`rows: ${ROW_COUNT}`)
	console.log(`source: ${SOURCE_PATH}`)
	console.log(`${jsObjects.name}: ${jsObjects.durationMs.toFixed(2)}ms result=${jsObjects.result.toFixed(2)}`)
	console.log(`${jsTyped.name}: ${jsTyped.durationMs.toFixed(2)}ms result=${jsTyped.result.toFixed(2)}`)
	console.log(`${wasmPacked.name}: ${wasmPacked.durationMs.toFixed(2)}ms result=${wasmPacked.result.toFixed(2)}`)
}

function measure(name: string, fn: () => number): {
	name: string,
	durationMs: number,
	result: number,
} {
	const start = performance.now()
	const result = fn()
	const durationMs = performance.now() - start

	return {
		name,
		durationMs,
		result,
	}
}

function assertClose(actual: number, expected: number, context: string): void {
	const diff = Math.abs(actual - expected)
	if (diff > 0.0001) {
		throw new Error(`${context}: expected ${expected}, got ${actual}`)
	}
}

main().catch(error => {
	console.error(error instanceof Error
		? error.message
		: String(error))
	process.exit(1)
})
