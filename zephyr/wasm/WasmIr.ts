type WasmValueType = 'i32' | 'f64'

type WasmInstruction =
	| {
		op: 'local.get',
		index: number,
	}
	| {
		op: 'local.set' | 'local.tee',
		index: number,
	}
	| {
		op: 'global.get' | 'global.set',
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
		op: 'i32.eq' | 'i32.ne' | 'i32.lt_s' | 'i32.gt_s' | 'i32.le_s' | 'i32.ge_s'
			| 'f64.eq' | 'f64.ne' | 'f64.lt' | 'f64.gt' | 'f64.le' | 'f64.ge',
	}
	| {
		op: 'i32.load' | 'f64.load' | 'i32.store' | 'f64.store',
		align: number,
		offset: number,
	}
	| {
		op: 'block' | 'loop',
		result?: WasmValueType,
		body: WasmInstruction[],
	}
	| {
		op: 'br' | 'br_if',
		labelIndex: number,
	}
	| {
		op: 'return',
	}

interface WasmMemoryIr {
	minPages: number,
	maxPages?: number,
	exportName?: string,
}

interface WasmGlobalIr {
	name?: string,
	type: WasmValueType,
	mutable: boolean,
	initialValue: number,
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
	globals?: WasmGlobalIr[],
	functions: WasmFunctionIr[],
}

export {
	type WasmFunctionIr,
	type WasmGlobalIr,
	type WasmInstruction,
	type WasmMemoryIr,
	type WasmModuleIr,
	type WasmValueType,
}
