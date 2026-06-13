import {
	compileZephyrFileToWasmModule,
	createRecordLayout,
	emitWasmModule,
	getRecordField,
} from '../../zephyr/wasm'

interface WebAssemblyRuntime {
	compile: (bytes: Uint8Array) => Promise<unknown>,
	instantiate: (module: unknown) => Promise<{
		exports: Record<string, unknown>,
	}>,
}

interface RowObject {
	id: number,
	amount: number,
	active: boolean,
}

const ROW_COUNT = 5_000_000
const ACTIVE_MOD = 3
const BASE_PTR = 4096
const SOURCE_PATH = 'examples/wasm_table_aggregate/table_aggregate.zph'

async function main(): Promise<void> {
	const rowLayout = createRecordLayout([
		{
			name: 'id',
			type: 'f64',
		},
		{
			name: 'amount',
			type: 'f64',
		},
		{
			name: 'active',
			type: 'i32',
		},
	])
	const amountField = getRecordField(rowLayout, 'amount')
	const activeField = getRecordField(rowLayout, 'active')
	const wasm = (globalThis as unknown as {WebAssembly: WebAssemblyRuntime}).WebAssembly
	const sourceModule = compileZephyrFileToWasmModule(SOURCE_PATH)
	const module = {
		...sourceModule,
		memory: {
			minPages: Math.ceil((BASE_PTR + ROW_COUNT * rowLayout.size) / 65536),
			exportName: 'memory',
		},
	}
	const instance = await wasm.instantiate(await wasm.compile(emitWasmModule(module)))
	const memory = instance.exports.memory
	const sumActiveAmount = instance.exports.sumActiveAmount
	if (!isWasmMemory(memory)) {
		throw new Error('Expected exported memory')
	}
	if (typeof sumActiveAmount !== 'function') {
		throw new Error('Expected exported sumActiveAmount')
	}

	const objectRows = createObjectRows(ROW_COUNT)
	const typedRows = createTypedRows(ROW_COUNT)
	fillWasmRows(memory.buffer, rowLayout.size, amountField.offset, activeField.offset, ROW_COUNT)

	const jsObjects = measure('JS object array', () => sumObjectRows(objectRows))
	const jsTyped = measure('JS typed arrays', () => sumTypedRows(typedRows.amounts, typedRows.active))
	const wasmPacked = measure('Zephyr Wasm packed records', () =>
		(sumActiveAmount as (basePtr: number, length: number) => number)(BASE_PTR, ROW_COUNT))

	assertClose(jsObjects.result, jsTyped.result, 'JS object and typed array results differ')
	assertClose(jsObjects.result, wasmPacked.result, 'JS object and Wasm results differ')

	console.log(`rows: ${ROW_COUNT}`)
	console.log(`source: ${SOURCE_PATH}`)
	console.log(`${jsObjects.name}: ${jsObjects.durationMs.toFixed(2)}ms result=${jsObjects.result.toFixed(2)}`)
	console.log(`${jsTyped.name}: ${jsTyped.durationMs.toFixed(2)}ms result=${jsTyped.result.toFixed(2)}`)
	console.log(`${wasmPacked.name}: ${wasmPacked.durationMs.toFixed(2)}ms result=${wasmPacked.result.toFixed(2)}`)
}

function createObjectRows(count: number): RowObject[] {
	const rows: RowObject[] = []
	for (let index = 0; index < count; index++) {
		rows.push({
			id: index,
			amount: createAmount(index),
			active: isActive(index),
		})
	}

	return rows
}

function createTypedRows(count: number): {
	amounts: Float64Array,
	active: Int32Array,
} {
	const amounts = new Float64Array(count)
	const active = new Int32Array(count)
	for (let index = 0; index < count; index++) {
		amounts[index] = createAmount(index)
		active[index] = isActive(index)
			? 1
			: 0
	}

	return {
		amounts,
		active,
	}
}

function fillWasmRows(buffer: ArrayBuffer, recordSize: number, amountOffset: number, activeOffset: number, count: number): void {
	const view = new DataView(buffer)
	for (let index = 0; index < count; index++) {
		const rowPtr = BASE_PTR + index * recordSize
		view.setFloat64(rowPtr, index, true)
		view.setFloat64(rowPtr + amountOffset, createAmount(index), true)
		view.setInt32(rowPtr + activeOffset, isActive(index)
			? 1
			: 0, true)
	}
}

function sumObjectRows(rows: RowObject[]): number {
	let sum = 0
	for (const row of rows) {
		if (row.active) {
			sum += row.amount
		}
	}

	return sum
}

function sumTypedRows(amounts: Float64Array, active: Int32Array): number {
	let sum = 0
	for (let index = 0; index < amounts.length; index++) {
		if (active[index] === 1) {
			sum += amounts[index]
		}
	}

	return sum
}

function createAmount(index: number): number {
	return (index % 10_000) * 0.5 + 1
}

function isActive(index: number): boolean {
	return index % ACTIVE_MOD !== 0
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

function isWasmMemory(value: unknown): value is {buffer: ArrayBuffer} {
	return typeof value === 'object'
		&& value !== null
		&& 'buffer' in value
		&& value.buffer instanceof ArrayBuffer
}

main().catch(error => {
	console.error(error instanceof Error
		? error.message
		: String(error))
	process.exit(1)
})
