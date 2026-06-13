import {type WasmFunctionIr} from './WasmIr'

const ARRAY_HEADER_SIZE = 12
const ARRAY_LENGTH_OFFSET = 0
const ARRAY_CAPACITY_OFFSET = 4
const ARRAY_DATA_PTR_OFFSET = 8

interface AllocHelperOptions {
	exported?: boolean,
	heapPtrGlobalIndex?: number,
}

interface ArrayNewHelperOptions {
	allocFunctionIndex: number,
	exported?: boolean,
}

interface ArrayGetPtrHelperOptions {
	exported?: boolean,
}

function createAllocFunction(options: AllocHelperOptions = {}): WasmFunctionIr {
	const heapPtrGlobalIndex = options.heapPtrGlobalIndex ?? 0

	return {
		name: 'alloc',
		params: ['i32'],
		result: 'i32',
		locals: ['i32'],
		body: [
			{
				op: 'global.get',
				index: heapPtrGlobalIndex,
			},
			{
				op: 'local.set',
				index: 1,
			},
			{
				op: 'global.get',
				index: heapPtrGlobalIndex,
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
				index: heapPtrGlobalIndex,
			},
			{
				op: 'local.get',
				index: 1,
			},
			{
				op: 'return',
			},
		],
		exported: options.exported ?? false,
	}
}

function createArrayNewFunction(options: ArrayNewHelperOptions): WasmFunctionIr {
	return {
		name: 'arrayNew',
		params: ['i32', 'i32'],
		result: 'i32',
		locals: ['i32', 'i32'],
		body: [
			{
				op: 'i32.const',
				value: ARRAY_HEADER_SIZE,
			},
			{
				op: 'call',
				functionIndex: options.allocFunctionIndex,
			},
			{
				op: 'local.set',
				index: 2,
			},
			{
				op: 'local.get',
				index: 0,
			},
			{
				op: 'local.get',
				index: 1,
			},
			{
				op: 'i32.mul',
			},
			{
				op: 'call',
				functionIndex: options.allocFunctionIndex,
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
				op: 'local.get',
				index: 1,
			},
			{
				op: 'i32.store',
				align: 2,
				offset: ARRAY_LENGTH_OFFSET,
			},
			{
				op: 'local.get',
				index: 2,
			},
			{
				op: 'local.get',
				index: 1,
			},
			{
				op: 'i32.store',
				align: 2,
				offset: ARRAY_CAPACITY_OFFSET,
			},
			{
				op: 'local.get',
				index: 2,
			},
			{
				op: 'local.get',
				index: 3,
			},
			{
				op: 'i32.store',
				align: 2,
				offset: ARRAY_DATA_PTR_OFFSET,
			},
			{
				op: 'local.get',
				index: 2,
			},
			{
				op: 'return',
			},
		],
		exported: options.exported ?? true,
	}
}

function createArrayGetPtrFunction(options: ArrayGetPtrHelperOptions = {}): WasmFunctionIr {
	return {
		name: 'arrayGetPtr',
		params: ['i32', 'i32', 'i32'],
		result: 'i32',
		locals: [],
		body: [
			{
				op: 'local.get',
				index: 0,
			},
			{
				op: 'i32.load',
				align: 2,
				offset: ARRAY_DATA_PTR_OFFSET,
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
				op: 'i32.mul',
			},
			{
				op: 'i32.add',
			},
			{
				op: 'return',
			},
		],
		exported: options.exported ?? true,
	}
}

export {
	ARRAY_CAPACITY_OFFSET,
	ARRAY_DATA_PTR_OFFSET,
	ARRAY_HEADER_SIZE,
	ARRAY_LENGTH_OFFSET,
	createAllocFunction,
	createArrayGetPtrFunction,
	createArrayNewFunction,
}
