export {emitWasmModule} from './WasmBinaryEmitter'
export {
	ARRAY_CAPACITY_OFFSET,
	ARRAY_DATA_PTR_OFFSET,
	ARRAY_HEADER_SIZE,
	ARRAY_LENGTH_OFFSET,
	createAllocFunction,
	createArrayGetPtrFunction,
	createArrayNewFunction,
} from './RuntimeHelpers'
export {
	type WasmFunctionIr,
	type WasmInstruction,
	type WasmModuleIr,
	type WasmValueType,
} from './WasmIr'
