import {type WasmValueType} from './WasmIr'

interface WasmRecordField {
	name: string,
	type: WasmValueType,
}

interface WasmRecordFieldLayout extends WasmRecordField {
	offset: number,
	size: number,
	align: number,
}

interface WasmRecordLayout {
	fields: WasmRecordFieldLayout[],
	size: number,
}

function createRecordLayout(fields: WasmRecordField[]): WasmRecordLayout {
	let offset = 0
	const layouts: WasmRecordFieldLayout[] = []
	for (const field of fields) {
		const size = getValueTypeSize(field.type)
		const align = getValueTypeAlign(field.type)
		offset = alignOffset(offset, align)
		layouts.push({
			...field,
			offset,
			size,
			align,
		})
		offset += size
	}

	return {
		fields: layouts,
		size: alignOffset(offset, getRecordAlign(layouts)),
	}
}

function getRecordField(layout: WasmRecordLayout, name: string): WasmRecordFieldLayout {
	const field = layout.fields.find(item => item.name === name)
	if (field === undefined) {
		throw new Error(`Unknown record field: ${name}`)
	}

	return field
}

function getValueTypeSize(type: WasmValueType): number {
	switch (type) {
		case 'i32':
			return 4
		case 'f64':
			return 8
	}
}

function getValueTypeAlign(type: WasmValueType): number {
	return getValueTypeSize(type)
}

function getRecordAlign(fields: WasmRecordFieldLayout[]): number {
	return fields.reduce((max, field) => Math.max(max, field.align), 1)
}

function alignOffset(offset: number, align: number): number {
	const remainder = offset % align
	return remainder === 0
		? offset
		: offset + align - remainder
}

export {
	type WasmRecordField,
	type WasmRecordFieldLayout,
	type WasmRecordLayout,
	createRecordLayout,
	getRecordField,
}
