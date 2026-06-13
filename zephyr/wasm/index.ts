export {emitWasmModule} from './WasmBinaryEmitter'
export {lowerProgramToWasmIr} from './WasmLowerer'
export {
	type WasmRecordField,
	type WasmRecordFieldLayout,
	type WasmRecordLayout,
	createRecordLayout,
	getRecordField,
} from './RecordLayout'
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
