import {type WasmModuleIr, emitWasmModule} from '../zephyr/wasm'

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

run().catch(error => {
	console.error(error instanceof Error
		? error.message
		: String(error))
	process.exit(1)
})
