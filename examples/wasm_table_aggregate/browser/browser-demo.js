import {
	createObjectRows,
	createTableAggregateRuntime,
	createTypedRows,
	sumObjectRows,
	sumTypedRows,
} from '../table-runtime.js'

const WASM_PATH = './table_aggregate.wasm'

const rowCountInput = document.querySelector('#row-count')
const runButton = document.querySelector('#run-button')
const log = document.querySelector('#log')
const objectTime = document.querySelector('#object-time')
const objectResult = document.querySelector('#object-result')
const typedTime = document.querySelector('#typed-time')
const typedResult = document.querySelector('#typed-result')
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
	const tableRuntime = createTableAggregateRuntime(instance)

	writeLog(`Заполняю ${rowCount.toLocaleString('ru-RU')} строк...`)
	const objectRows = createObjectRows(rowCount)
	const typedRows = createTypedRows(rowCount)
	tableRuntime.fillRows(rowCount)

	const objectJs = measure(() => sumObjectRows(objectRows))
	const typedJs = measure(() => sumTypedRows(typedRows.amounts, typedRows.active))
	const wasm = measure(() => tableRuntime.sumActiveAmount(rowCount))
	assertClose(objectJs.result, typedJs.result)
	assertClose(objectJs.result, wasm.result)

	objectTime.textContent = `${objectJs.durationMs.toFixed(2)}ms`
	objectResult.textContent = `result: ${objectJs.result.toFixed(2)}`
	typedTime.textContent = `${typedJs.durationMs.toFixed(2)}ms`
	typedResult.textContent = `result: ${typedJs.result.toFixed(2)}`
	wasmTime.textContent = `${wasm.durationMs.toFixed(2)}ms`
	wasmResult.textContent = `result: ${wasm.result.toFixed(2)}`
	writeLog('Готово: результаты JS object arrays, JS typed arrays и Zephyr Wasm совпали.')
	runButton.disabled = false
}

async function instantiateWasm() {
	if ('instantiateStreaming' in WebAssembly) {
		try {
			const result = await WebAssembly.instantiateStreaming(fetch(WASM_PATH), {})
			return result.instance
		}
		catch {
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
