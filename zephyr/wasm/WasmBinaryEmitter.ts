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
const SECTION_EXPORT = 7
const SECTION_CODE = 10

const EXPORT_KIND_FUNCTION = 0x00
const FUNCTION_TYPE = 0x60

const OPCODES = {
	'end': 0x0b,
	'return': 0x0f,
	'local.get': 0x20,
	'i32.const': 0x41,
	'f64.const': 0x44,
	'i32.add': 0x6a,
	'i32.sub': 0x6b,
	'i32.mul': 0x6c,
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
	writeSection(writer, SECTION_EXPORT, section => writeExportSection(section, module.functions))
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

function writeExportSection(writer: BinaryWriter, functions: WasmFunctionIr[]): void {
	const exportedFunctions = functions
		.map((fn, index) => ({
			fn,
			index,
		}))
		.filter(item => item.fn.exported)
	writer.writeUnsignedLeb128(exportedFunctions.length)
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
			writer.writeUnsignedLeb128(instruction.index)
			break
		case 'i32.const':
			writer.writeSignedLeb128(instruction.value)
			break
		case 'f64.const':
			writer.writeFloat64(instruction.value)
			break
		case 'i32.add':
		case 'i32.sub':
		case 'i32.mul':
		case 'f64.add':
		case 'f64.sub':
		case 'f64.mul':
		case 'f64.div':
		case 'return':
			break
	}
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
