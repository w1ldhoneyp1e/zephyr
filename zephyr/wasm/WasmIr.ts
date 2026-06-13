type WasmValueType = 'i32' | 'f64'

type WasmInstruction =
	| {
		op: 'local.get',
		index: number,
	}
	| {
		op: 'i32.const',
		value: number,
	}
	| {
		op: 'f64.const',
		value: number,
	}
	| {
		op: 'i32.add' | 'i32.sub' | 'i32.mul' | 'f64.add' | 'f64.sub' | 'f64.mul' | 'f64.div',
	}
	| {
		op: 'i32.load' | 'f64.load' | 'i32.store' | 'f64.store',
		align: number,
		offset: number,
	}
	| {
		op: 'return',
	}

interface WasmMemoryIr {
	minPages: number,
	maxPages?: number,
	exportName?: string,
}

interface WasmFunctionIr {
	name: string,
	params: WasmValueType[],
	result: WasmValueType | null,
	locals: WasmValueType[],
	body: WasmInstruction[],
	exported: boolean,
}

interface WasmModuleIr {
	memory?: WasmMemoryIr,
	functions: WasmFunctionIr[],
}

export {
	type WasmFunctionIr,
	type WasmInstruction,
	type WasmMemoryIr,
	type WasmModuleIr,
	type WasmValueType,
}
