const BASE_PTR = 4096
const ROW_LAYOUT = {
	size: 24,
	idOffset: 0,
	amountOffset: 8,
	activeOffset: 16,
}
const ACTIVE_MOD = 3

function createTableAggregateRuntime(instance) {
	const memory = instance.exports.memory
	const sumActiveAmount = instance.exports.sumActiveAmount
	if (!isWasmMemory(memory)) {
		throw new Error('Wasm module must export memory')
	}
	if (typeof sumActiveAmount !== 'function') {
		throw new Error('Wasm module must export sumActiveAmount')
	}

	return {
		basePtr: BASE_PTR,
		memory,
		fillRows(count) {
			ensureMemoryCapacity(memory, BASE_PTR + count * ROW_LAYOUT.size)
			fillWasmRows(memory.buffer, count)
		},
		sumActiveAmount(count) {
			return sumActiveAmount(BASE_PTR, count)
		},
	}
}

function createTypedRows(count) {
	const amounts = new Float64Array(count)
	const active = new Int32Array(count)
	for (let index = 0; index < count; index++) {
		amounts[index] = createAmount(index)
		active[index] = isActive(index)
			? 1
			: 0
	}

	return {
		amounts,
		active,
	}
}

function createObjectRows(count) {
	const rows = []
	for (let index = 0; index < count; index++) {
		rows.push({
			id: index,
			amount: createAmount(index),
			active: isActive(index),
		})
	}

	return rows
}

function fillWasmRows(buffer, count) {
	const view = new DataView(buffer)
	for (let index = 0; index < count; index++) {
		const rowPtr = BASE_PTR + index * ROW_LAYOUT.size
		view.setFloat64(rowPtr + ROW_LAYOUT.idOffset, index, true)
		view.setFloat64(rowPtr + ROW_LAYOUT.amountOffset, createAmount(index), true)
		view.setInt32(rowPtr + ROW_LAYOUT.activeOffset, isActive(index)
			? 1
			: 0, true)
	}
}

function sumObjectRows(rows) {
	let sum = 0
	for (const row of rows) {
		if (row.active) {
			sum += row.amount
		}
	}

	return sum
}

function sumTypedRows(amounts, active) {
	let sum = 0
	for (let index = 0; index < amounts.length; index++) {
		if (active[index] === 1) {
			sum += amounts[index]
		}
	}

	return sum
}

function createAmount(index) {
	return (index % 10_000) * 0.5 + 1
}

function isActive(index) {
	return index % ACTIVE_MOD !== 0
}

function ensureMemoryCapacity(memory, requiredBytes) {
	const pageSize = 65536
	const requiredPages = Math.ceil(requiredBytes / pageSize)
	const currentPages = memory.buffer.byteLength / pageSize
	if (requiredPages > currentPages) {
		memory.grow(requiredPages - currentPages)
	}
}

function isWasmMemory(value) {
	return typeof WebAssembly !== 'undefined'
		? value instanceof WebAssembly.Memory
		: typeof value === 'object' && value !== null && 'buffer' in value
}

export {
	BASE_PTR,
	ROW_LAYOUT,
	createObjectRows,
	createTableAggregateRuntime,
	createTypedRows,
	sumObjectRows,
	sumTypedRows,
}
