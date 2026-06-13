import {BinaryWriter} from './BinaryWriter'
import {
	type WasmFunctionIr,
	type WasmInstruction,
	type WasmModuleIr,
	type WasmValueType,
} from './WasmIr'

const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d] as const
const WASM_VERSION = [0x01, 0x00, 0x00, 0x00] as const

const SECTION_TYPE = 1
const SECTION_FUNCTION = 3
const SECTION_MEMORY = 5
const SECTION_GLOBAL = 6
const SECTION_EXPORT = 7
const SECTION_CODE = 10

const EXPORT_KIND_FUNCTION = 0x00
const EXPORT_KIND_GLOBAL = 0x03
const EXPORT_KIND_MEMORY = 0x02
const FUNCTION_TYPE = 0x60

const OPCODES = {
	'end': 0x0b,
	'block': 0x02,
	'loop': 0x03,
	'br': 0x0c,
	'br_if': 0x0d,
	'return': 0x0f,
	'call': 0x10,
	'local.get': 0x20,
	'local.set': 0x21,
	'local.tee': 0x22,
	'global.get': 0x23,
	'global.set': 0x24,
	'i32.const': 0x41,
	'f64.const': 0x44,
	'i32.load': 0x28,
	'f64.load': 0x2b,
	'i32.store': 0x36,
	'f64.store': 0x39,
	'i32.add': 0x6a,
	'i32.sub': 0x6b,
	'i32.mul': 0x6c,
	'i32.eq': 0x46,
	'i32.ne': 0x47,
	'i32.lt_s': 0x48,
	'i32.gt_s': 0x4a,
	'i32.le_s': 0x4c,
	'i32.ge_s': 0x4e,
	'f64.eq': 0x61,
	'f64.ne': 0x62,
	'f64.lt': 0x63,
	'f64.gt': 0x64,
	'f64.le': 0x65,
	'f64.ge': 0x66,
	'f64.add': 0xa0,
	'f64.sub': 0xa1,
	'f64.mul': 0xa2,
	'f64.div': 0xa3,
} as const

function emitWasmModule(module: WasmModuleIr): Uint8Array {
	const writer = new BinaryWriter()
	writer.writeBytes(WASM_MAGIC)
	writer.writeBytes(WASM_VERSION)
	writeSection(writer, SECTION_TYPE, section => writeTypeSection(section, module.functions))
	writeSection(writer, SECTION_FUNCTION, section => writeFunctionSection(section, module.functions))
	if (module.memory !== undefined) {
		writeSection(writer, SECTION_MEMORY, section => writeMemorySection(section, module))
	}
	if (module.globals !== undefined && module.globals.length > 0) {
		writeSection(writer, SECTION_GLOBAL, section => writeGlobalSection(section, module))
	}
	writeSection(writer, SECTION_EXPORT, section => writeExportSection(section, module))
	writeSection(writer, SECTION_CODE, section => writeCodeSection(section, module.functions))

	return writer.toUint8Array()
}

function writeSection(writer: BinaryWriter, sectionId: number, writePayload: (writer: BinaryWriter) => void): void {
	const payload = new BinaryWriter()
	writePayload(payload)
	const bytes = payload.toUint8Array()
	writer.writeByte(sectionId)
	writer.writeUnsignedLeb128(bytes.length)
	writer.writeBytes(bytes)
}

function writeTypeSection(writer: BinaryWriter, functions: WasmFunctionIr[]): void {
	writer.writeUnsignedLeb128(functions.length)
	for (const fn of functions) {
		writer.writeByte(FUNCTION_TYPE)
		writeValueTypeVector(writer, fn.params)
		writeValueTypeVector(writer, fn.result === null
			? []
			: [fn.result])
	}
}

function writeFunctionSection(writer: BinaryWriter, functions: WasmFunctionIr[]): void {
	writer.writeUnsignedLeb128(functions.length)
	for (const [index] of functions.entries()) {
		writer.writeUnsignedLeb128(index)
	}
}

function writeMemorySection(writer: BinaryWriter, module: WasmModuleIr): void {
	const memory = module.memory
	if (memory === undefined) {
		writer.writeUnsignedLeb128(0)
		return
	}
	writer.writeUnsignedLeb128(1)
	if (memory.maxPages === undefined) {
		writer.writeByte(0x00)
		writer.writeUnsignedLeb128(memory.minPages)
	}
	else {
		writer.writeByte(0x01)
		writer.writeUnsignedLeb128(memory.minPages)
		writer.writeUnsignedLeb128(memory.maxPages)
	}
}

function writeGlobalSection(writer: BinaryWriter, module: WasmModuleIr): void {
	const globals = module.globals ?? []
	writer.writeUnsignedLeb128(globals.length)
	for (const global of globals) {
		writer.writeByte(encodeValueType(global.type))
		writer.writeByte(global.mutable
			? 0x01
			: 0x00)
		writeConstInstruction(writer, global.type, global.initialValue)
		writer.writeByte(OPCODES.end)
	}
}

function writeExportSection(writer: BinaryWriter, module: WasmModuleIr): void {
	const exportedFunctions = module.functions
		.map((fn, index) => ({
			fn,
			index,
		}))
		.filter(item => item.fn.exported)
	const exportedGlobals = (module.globals ?? [])
		.map((global, index) => ({
			global,
			index,
		}))
		.filter(item => item.global.exportName !== undefined)
	const memoryExportName = module.memory?.exportName ?? null
	writer.writeUnsignedLeb128(
		exportedFunctions.length
			+ exportedGlobals.length
			+ (memoryExportName === null
				? 0
				: 1),
	)
	if (memoryExportName !== null) {
		writer.writeString(memoryExportName)
		writer.writeByte(EXPORT_KIND_MEMORY)
		writer.writeUnsignedLeb128(0)
	}
	for (const {global, index} of exportedGlobals) {
		writer.writeString(global.exportName ?? global.name ?? `global${index}`)
		writer.writeByte(EXPORT_KIND_GLOBAL)
		writer.writeUnsignedLeb128(index)
	}
	for (const {fn, index} of exportedFunctions) {
		writer.writeString(fn.name)
		writer.writeByte(EXPORT_KIND_FUNCTION)
		writer.writeUnsignedLeb128(index)
	}
}

function writeCodeSection(writer: BinaryWriter, functions: WasmFunctionIr[]): void {
	writer.writeUnsignedLeb128(functions.length)
	for (const fn of functions) {
		const body = new BinaryWriter()
		writeLocals(body, fn.locals)
		for (const instruction of fn.body) {
			writeInstruction(body, instruction)
		}
		body.writeByte(OPCODES.end)
		const bodyBytes = body.toUint8Array()
		writer.writeUnsignedLeb128(bodyBytes.length)
		writer.writeBytes(bodyBytes)
	}
}

function writeLocals(writer: BinaryWriter, locals: WasmValueType[]): void {
	const groups: {
		type: WasmValueType,
		count: number,
	}[] = []
	for (const local of locals) {
		const last = groups[groups.length - 1]
		if (last?.type === local) {
			last.count++
		}
		else {
			groups.push({
				type: local,
				count: 1,
			})
		}
	}
	writer.writeUnsignedLeb128(groups.length)
	for (const group of groups) {
		writer.writeUnsignedLeb128(group.count)
		writer.writeByte(encodeValueType(group.type))
	}
}

function writeInstruction(writer: BinaryWriter, instruction: WasmInstruction): void {
	writer.writeByte(OPCODES[instruction.op])
	switch (instruction.op) {
		case 'local.get':
		case 'local.set':
		case 'local.tee':
		case 'global.get':
		case 'global.set':
			writer.writeUnsignedLeb128(instruction.index)
			break
		case 'call':
			writer.writeUnsignedLeb128(instruction.functionIndex)
			break
		case 'i32.const':
			writer.writeSignedLeb128(instruction.value)
			break
		case 'f64.const':
			writer.writeFloat64(instruction.value)
			break
		case 'i32.load':
		case 'f64.load':
		case 'i32.store':
		case 'f64.store':
			writer.writeUnsignedLeb128(instruction.align)
			writer.writeUnsignedLeb128(instruction.offset)
			break
		case 'block':
		case 'loop':
			writeBlockType(writer, instruction.result ?? null)
			for (const child of instruction.body) {
				writeInstruction(writer, child)
			}
			writer.writeByte(OPCODES.end)
			break
		case 'br':
		case 'br_if':
			writer.writeUnsignedLeb128(instruction.labelIndex)
			break
		case 'i32.add':
		case 'i32.sub':
		case 'i32.mul':
		case 'i32.eq':
		case 'i32.ne':
		case 'i32.lt_s':
		case 'i32.gt_s':
		case 'i32.le_s':
		case 'i32.ge_s':
		case 'f64.eq':
		case 'f64.ne':
		case 'f64.lt':
		case 'f64.gt':
		case 'f64.le':
		case 'f64.ge':
		case 'f64.add':
		case 'f64.sub':
		case 'f64.mul':
		case 'f64.div':
		case 'return':
			break
	}
}

function writeConstInstruction(writer: BinaryWriter, type: WasmValueType, value: number): void {
	switch (type) {
		case 'i32':
			writer.writeByte(OPCODES['i32.const'])
			writer.writeSignedLeb128(value)
			break
		case 'f64':
			writer.writeByte(OPCODES['f64.const'])
			writer.writeFloat64(value)
			break
	}
}

function writeBlockType(writer: BinaryWriter, result: WasmValueType | null): void {
	if (result === null) {
		writer.writeByte(0x40)
		return
	}
	writer.writeByte(encodeValueType(result))
}

function writeValueTypeVector(writer: BinaryWriter, types: WasmValueType[]): void {
	writer.writeUnsignedLeb128(types.length)
	for (const type of types) {
		writer.writeByte(encodeValueType(type))
	}
}

function encodeValueType(type: WasmValueType): number {
	switch (type) {
		case 'i32':
			return 0x7f
		case 'f64':
			return 0x7c
	}
}

export {
	emitWasmModule,
}
