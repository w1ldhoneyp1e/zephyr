const BASE_PTR = 4096
const RECORD_SIZE = 24
const AMOUNT_OFFSET = 8
const ACTIVE_OFFSET = 16
const ACTIVE_MOD = 3
const WASM_PATH = './table_aggregate.wasm'

const rowCountInput = document.querySelector('#row-count')
const runButton = document.querySelector('#run-button')
const log = document.querySelector('#log')
const jsTime = document.querySelector('#js-time')
const jsResult = document.querySelector('#js-result')
const wasmTime = document.querySelector('#wasm-time')
const wasmResult = document.querySelector('#wasm-result')

runButton.addEventListener('click', () => {
	runBenchmark().catch(error => {
		writeLog(error instanceof Error
			? error.message
			: String(error))
		runButton.disabled = false
	})
})

async function runBenchmark() {
	runButton.disabled = true
	writeLog('Загружаю wasm...')
	const rowCount = Number(rowCountInput.value)
	const instance = await instantiateWasm()
	const memory = instance.exports.memory
	const sumActiveAmount = instance.exports.sumActiveAmount
	if (!(memory instanceof WebAssembly.Memory)) {
		throw new Error('Wasm module must export memory')
	}
	if (typeof sumActiveAmount !== 'function') {
		throw new Error('Wasm module must export sumActiveAmount')
	}

	ensureMemoryCapacity(memory, BASE_PTR + rowCount * RECORD_SIZE)
	writeLog(`Заполняю ${rowCount.toLocaleString('ru-RU')} строк...`)
	const typedRows = createTypedRows(rowCount)
	fillWasmRows(memory.buffer, rowCount)

	const js = measure(() => sumTypedRows(typedRows.amounts, typedRows.active))
	const wasm = measure(() => sumActiveAmount(BASE_PTR, rowCount))
	assertClose(js.result, wasm.result)

	jsTime.textContent = `${js.durationMs.toFixed(2)}ms`
	jsResult.textContent = `result: ${js.result.toFixed(2)}`
	wasmTime.textContent = `${wasm.durationMs.toFixed(2)}ms`
	wasmResult.textContent = `result: ${wasm.result.toFixed(2)}`
	writeLog('Готово: результат JS и Zephyr Wasm совпал.')
	runButton.disabled = false
}

async function instantiateWasm() {
	if ('instantiateStreaming' in WebAssembly) {
		try {
			const result = await WebAssembly.instantiateStreaming(fetch(WASM_PATH), {})
			return result.instance
		}
		catch {
			// Some static servers do not send application/wasm. Fallback keeps the demo easy to run.
		}
	}
	const response = await fetch(WASM_PATH)
	if (!response.ok) {
		throw new Error(`Не удалось загрузить ${WASM_PATH}. Сначала выполните yarn demo:wasm-browser:build`)
	}
	const bytes = await response.arrayBuffer()
	const result = await WebAssembly.instantiate(bytes, {})

	return result.instance
}

function ensureMemoryCapacity(memory, requiredBytes) {
	const pageSize = 65536
	const requiredPages = Math.ceil(requiredBytes / pageSize)
	const currentPages = memory.buffer.byteLength / pageSize
	if (requiredPages > currentPages) {
		memory.grow(requiredPages - currentPages)
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

function fillWasmRows(buffer, count) {
	const view = new DataView(buffer)
	for (let index = 0; index < count; index++) {
		const rowPtr = BASE_PTR + index * RECORD_SIZE
		view.setFloat64(rowPtr, index, true)
		view.setFloat64(rowPtr + AMOUNT_OFFSET, createAmount(index), true)
		view.setInt32(rowPtr + ACTIVE_OFFSET, isActive(index)
			? 1
			: 0, true)
	}
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

function measure(fn) {
	const start = performance.now()
	const result = fn()
	const durationMs = performance.now() - start

	return {
		durationMs,
		result,
	}
}

function assertClose(actual, expected) {
	const diff = Math.abs(actual - expected)
	if (diff > 0.0001) {
		throw new Error(`Результаты отличаются: JS=${actual}, Wasm=${expected}`)
	}
}

function writeLog(message) {
	log.textContent = message
}
