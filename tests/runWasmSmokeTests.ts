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
	console.log('passed wasm smoke tests')
}

run().catch(error => {
	console.error(error instanceof Error
		? error.message
		: String(error))
	process.exit(1)
})
