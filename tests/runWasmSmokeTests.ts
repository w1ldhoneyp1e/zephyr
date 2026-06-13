import {
	ARRAY_CAPACITY_OFFSET,
	ARRAY_DATA_PTR_OFFSET,
	ARRAY_LENGTH_OFFSET,
	createAllocFunction,
	createArrayGetPtrFunction,
	createArrayNewFunction,
	emitWasmModule,
	type WasmModuleIr,
} from '../zephyr/wasm'

interface WebAssemblyRuntime {
	compile: (bytes: Uint8Array) => Promise<unknown>,
	instantiate: (module: unknown) => Promise<{
		exports: Record<string, unknown>,
	}>,
}

function assert(condition: boolean, message: string): void {
	if (!condition) {
		throw new Error(message)
	}
}

async function run(): Promise<void> {
	const module: WasmModuleIr = {
		functions: [
			{
				name: 'add',
				params: ['f64', 'f64'],
				result: 'f64',
				locals: [],
				body: [
					{
						op: 'local.get',
						index: 0,
					},
					{
						op: 'local.get',
						index: 1,
					},
					{
						op: 'f64.add',
					},
					{
						op: 'return',
					},
				],
				exported: true,
			},
		],
	}
	const bytes = emitWasmModule(module)
	const wasm = (globalThis as unknown as {WebAssembly: WebAssemblyRuntime}).WebAssembly
	const compiled = await wasm.compile(bytes)
	const instance = await wasm.instantiate(compiled)
	const add = instance.exports.add
	assert(typeof add === 'function', 'Expected exported add function')
	const addFn = add as (left: number, right: number) => number
	assert(addFn(20, 22) === 42, 'Expected add(20, 22) to return 42')
	await assertMemoryStore()
	await assertLoopSum()
	await assertAlloc()
	await assertArrayHelpers()
	await assertRecordAggregate()
	console.log('passed wasm smoke tests')
}

async function assertMemoryStore(): Promise<void> {
	const module: WasmModuleIr = {
		memory: {
			minPages: 1,
			exportName: 'memory',
		},
		functions: [
			{
				name: 'storeF64',
				params: ['i32', 'f64'],
				result: null,
				locals: [],
				body: [
					{
						op: 'local.get',
						index: 0,
					},
					{
						op: 'local.get',
						index: 1,
					},
					{
						op: 'f64.store',
						align: 3,
						offset: 0,
					},
				],
				exported: true,
			},
		],
	}
	const wasm = (globalThis as unknown as {WebAssembly: WebAssemblyRuntime}).WebAssembly
	const compiled = await wasm.compile(emitWasmModule(module))
	const instance = await wasm.instantiate(compiled)
	const storeF64 = instance.exports.storeF64
	const memory = instance.exports.memory
	assert(typeof storeF64 === 'function', 'Expected exported storeF64 function')
	if (!isWasmMemory(memory)) {
		throw new Error('Expected exported memory')
	}
	const storeF64Fn = storeF64 as (ptr: number, value: number) => void
	storeF64Fn(16, 123.5)
	const actual = new DataView(memory.buffer).getFloat64(16, true)
	assert(actual === 123.5, 'Expected storeF64 to write 123.5 into memory')
}

function isWasmMemory(value: unknown): value is {buffer: ArrayBuffer} {
	return typeof value === 'object'
		&& value !== null
		&& 'buffer' in value
		&& value.buffer instanceof ArrayBuffer
}

async function assertLoopSum(): Promise<void> {
	const module: WasmModuleIr = {
		functions: [
			{
				name: 'sumTo',
				params: ['i32'],
				result: 'i32',
				locals: ['i32', 'i32'],
				body: [
					{
						op: 'i32.const',
						value: 0,
					},
					{
						op: 'local.set',
						index: 1,
					},
					{
						op: 'i32.const',
						value: 1,
					},
					{
						op: 'local.set',
						index: 2,
					},
					{
						op: 'block',
						body: [
							{
								op: 'loop',
								body: [
									{
										op: 'local.get',
										index: 2,
									},
									{
										op: 'local.get',
										index: 0,
									},
									{
										op: 'i32.gt_s',
									},
									{
										op: 'br_if',
										labelIndex: 1,
									},
									{
										op: 'local.get',
										index: 1,
									},
									{
										op: 'local.get',
										index: 2,
									},
									{
										op: 'i32.add',
									},
									{
										op: 'local.set',
										index: 1,
									},
									{
										op: 'local.get',
										index: 2,
									},
									{
										op: 'i32.const',
										value: 1,
									},
									{
										op: 'i32.add',
									},
									{
										op: 'local.set',
										index: 2,
									},
									{
										op: 'br',
										labelIndex: 0,
									},
								],
							},
						],
					},
					{
						op: 'local.get',
						index: 1,
					},
					{
						op: 'return',
					},
				],
				exported: true,
			},
		],
	}
	const wasm = (globalThis as unknown as {WebAssembly: WebAssemblyRuntime}).WebAssembly
	const compiled = await wasm.compile(emitWasmModule(module))
	const instance = await wasm.instantiate(compiled)
	const sumTo = instance.exports.sumTo
	assert(typeof sumTo === 'function', 'Expected exported sumTo function')
	const sumToFn = sumTo as (value: number) => number
	assert(sumToFn(10) === 55, 'Expected sumTo(10) to return 55')
}

async function assertAlloc(): Promise<void> {
	const module: WasmModuleIr = {
		memory: {
			minPages: 1,
			exportName: 'memory',
		},
		globals: [
			{
				name: 'heapPtr',
				type: 'i32',
				mutable: true,
				initialValue: 1024,
				exportName: 'heapPtr',
			},
		],
		functions: [
			{
				name: 'alloc',
				params: ['i32'],
				result: 'i32',
				locals: ['i32'],
				body: [
					{
						op: 'global.get',
						index: 0,
					},
					{
						op: 'local.set',
						index: 1,
					},
					{
						op: 'global.get',
						index: 0,
					},
					{
						op: 'local.get',
						index: 0,
					},
					{
						op: 'i32.add',
					},
					{
						op: 'global.set',
						index: 0,
					},
					{
						op: 'local.get',
						index: 1,
					},
					{
						op: 'return',
					},
				],
				exported: true,
			},
		],
	}
	const wasm = (globalThis as unknown as {WebAssembly: WebAssemblyRuntime}).WebAssembly
	const compiled = await wasm.compile(emitWasmModule(module))
	const instance = await wasm.instantiate(compiled)
	const alloc = instance.exports.alloc
	assert(typeof alloc === 'function', 'Expected exported alloc function')
	const allocFn = alloc as (size: number) => number
	assert(allocFn(16) === 1024, 'Expected first alloc to return initial heap pointer')
	assert(allocFn(8) === 1040, 'Expected second alloc to return advanced heap pointer')
}

async function assertArrayHelpers(): Promise<void> {
	const module: WasmModuleIr = {
		memory: {
			minPages: 1,
			exportName: 'memory',
		},
		globals: [
			{
				name: 'heapPtr',
				type: 'i32',
				mutable: true,
				initialValue: 2048,
			},
		],
		functions: [
			createAllocFunction(),
			createArrayNewFunction({allocFunctionIndex: 0}),
			createArrayGetPtrFunction(),
		],
	}
	const wasm = (globalThis as unknown as {WebAssembly: WebAssemblyRuntime}).WebAssembly
	const compiled = await wasm.compile(emitWasmModule(module))
	const instance = await wasm.instantiate(compiled)
	const arrayNew = instance.exports.arrayNew
	const arrayGetPtr = instance.exports.arrayGetPtr
	const memory = instance.exports.memory
	assert(typeof arrayNew === 'function', 'Expected exported arrayNew function')
	assert(typeof arrayGetPtr === 'function', 'Expected exported arrayGetPtr function')
	if (!isWasmMemory(memory)) {
		throw new Error('Expected exported memory')
	}
	const arrayNewFn = arrayNew as (elementSize: number, length: number) => number
	const arrayGetPtrFn = arrayGetPtr as (arrayPtr: number, index: number, elementSize: number) => number
	const arrayPtr = arrayNewFn(8, 3)
	const view = new DataView(memory.buffer)
	const dataPtr = view.getInt32(arrayPtr + ARRAY_DATA_PTR_OFFSET, true)
	assert(view.getInt32(arrayPtr + ARRAY_LENGTH_OFFSET, true) === 3, 'Expected array length to be 3')
	assert(view.getInt32(arrayPtr + ARRAY_CAPACITY_OFFSET, true) === 3, 'Expected array capacity to be 3')
	assert(arrayGetPtrFn(arrayPtr, 0, 8) === dataPtr, 'Expected index 0 pointer to equal data pointer')
	assert(arrayGetPtrFn(arrayPtr, 2, 8) === dataPtr + 16, 'Expected index 2 pointer to use element size')
}

async function assertRecordAggregate(): Promise<void> {
	const module: WasmModuleIr = {
		memory: {
			minPages: 1,
			exportName: 'memory',
		},
		functions: [
			{
				name: 'sumSecondField',
				params: ['i32', 'i32'],
				result: 'f64',
				locals: ['i32', 'f64'],
				body: [
					{
						op: 'i32.const',
						value: 0,
					},
					{
						op: 'local.set',
						index: 2,
					},
					{
						op: 'f64.const',
						value: 0,
					},
					{
						op: 'local.set',
						index: 3,
					},
					{
						op: 'block',
						body: [
							{
								op: 'loop',
								body: [
									{
										op: 'local.get',
										index: 2,
									},
									{
										op: 'local.get',
										index: 1,
									},
									{
										op: 'i32.ge_s',
									},
									{
										op: 'br_if',
										labelIndex: 1,
									},
									{
										op: 'local.get',
										index: 3,
									},
									{
										op: 'local.get',
										index: 0,
									},
									{
										op: 'local.get',
										index: 2,
									},
									{
										op: 'i32.const',
										value: 16,
									},
									{
										op: 'i32.mul',
									},
									{
										op: 'i32.add',
									},
									{
										op: 'f64.load',
										align: 3,
										offset: 8,
									},
									{
										op: 'f64.add',
									},
									{
										op: 'local.set',
										index: 3,
									},
									{
										op: 'local.get',
										index: 2,
									},
									{
										op: 'i32.const',
										value: 1,
									},
									{
										op: 'i32.add',
									},
									{
										op: 'local.set',
										index: 2,
									},
									{
										op: 'br',
										labelIndex: 0,
									},
								],
							},
						],
					},
					{
						op: 'local.get',
						index: 3,
					},
					{
						op: 'return',
					},
				],
				exported: true,
			},
		],
	}
	const wasm = (globalThis as unknown as {WebAssembly: WebAssemblyRuntime}).WebAssembly
	const compiled = await wasm.compile(emitWasmModule(module))
	const instance = await wasm.instantiate(compiled)
	const memory = instance.exports.memory
	const sumSecondField = instance.exports.sumSecondField
	if (!isWasmMemory(memory)) {
		throw new Error('Expected exported memory')
	}
	assert(typeof sumSecondField === 'function', 'Expected exported sumSecondField function')
	const view = new DataView(memory.buffer)
	const basePtr = 4096
	const rows = [
		[1, 10],
		[2, 20.5],
		[3, 30.25],
	] as const
	for (const [index, row] of rows.entries()) {
		const rowPtr = basePtr + index * 16
		view.setFloat64(rowPtr, row[0], true)
		view.setFloat64(rowPtr + 8, row[1], true)
	}
	const sumSecondFieldFn = sumSecondField as (basePtr: number, length: number) => number
	assert(sumSecondFieldFn(basePtr, rows.length) === 60.75, 'Expected record aggregate sum to be 60.75')
}

run().catch(error => {
	console.error(error instanceof Error
		? error.message
		: String(error))
	process.exit(1)
})
