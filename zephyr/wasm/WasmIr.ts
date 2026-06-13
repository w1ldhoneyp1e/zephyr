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
		op: 'return',
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
	functions: WasmFunctionIr[],
}

export {
	type WasmFunctionIr,
	type WasmInstruction,
	type WasmModuleIr,
	type WasmValueType,
}
