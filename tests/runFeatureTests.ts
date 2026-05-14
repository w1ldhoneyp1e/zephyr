import * as fs from 'fs'
import * as path from 'path'
import {formatValue, Vm} from '../vm'
import {Compiler} from '../zephyr/Compiler'

interface FeatureTestCase {
	name: string,
	file: string,
	expectedReturn?: string | null,
	expectedStdout?: string,
	stdin?: string | null,
	expectedError?: string,
}

const TEST_CASES: FeatureTestCase[] = [
	{
		name: 'class_method',
		file: 'class_method.zph',
		expectedReturn: '5',
	},
	{
		name: 'class_field_assignment',
		file: 'class_field_assignment.zph',
		expectedReturn: '15',
	},
	{
		name: 'matrix_read',
		file: 'matrix_read.zph',
		expectedReturn: '4',
	},
	{
		name: 'matrix_write',
		file: 'matrix_write.zph',
		expectedReturn: '9',
	},
	{
		name: 'nullish_coalescing',
		file: 'nullish_coalescing.zph',
		expectedReturn: '7',
	},
	{
		name: 'optional_chaining',
		file: 'optional_chaining.zph',
		expectedReturn: '3',
	},
	{
		name: 'loop_control',
		file: 'loop_control.zph',
		expectedReturn: '8',
	},
	{
		name: 'print_stdout',
		file: 'print_stdout.zph',
		expectedReturn: '0',
		expectedStdout: 'line',
	},
	{
		name: 'read_and_readf',
		file: 'read_and_readf.zph',
		expectedReturn: '105',
		stdin: '5',
	},
	{
		name: 'break_outside_loop_error',
		file: 'break_outside_loop_error.zph',
		expectedError: 'Нельзя использовать break вне цикла',
	},
]

function runTestCase(testCase: FeatureTestCase): void {
	const fixturePath = path.resolve(__dirname, 'fixtures', testCase.file)
	const source = fs.readFileSync(fixturePath, 'utf-8')
	const compiler = new Compiler()
	const writes: string[] = []

	try {
		const programs = compiler.compile(source)
		const vm = new Vm({
			read: createRead(testCase.stdin ?? null),
			write: text => {
				writes.push(text)
			},
		})
		vm.load(programs)
		const result = vm.run()

		if (testCase.expectedError !== undefined) {
			throw new Error(`Ожидалась ошибка: ${testCase.expectedError}`)
		}

		const actualReturn = result === null
			? null
			: formatValue(result)
		if (actualReturn !== (testCase.expectedReturn ?? null)) {
			throw new Error(`Неверный return. Ожидалось: ${String(testCase.expectedReturn)}, получено: ${String(actualReturn)}`)
		}

		const actualStdout = writes.join('')
		if (actualStdout !== (testCase.expectedStdout ?? '')) {
			throw new Error(`Неверный stdout. Ожидалось: ${JSON.stringify(testCase.expectedStdout ?? '')}, получено: ${JSON.stringify(actualStdout)}`)
		}
	}
	catch (error) {
		const message = error instanceof Error
			? error.message
			: String(error)
		if (testCase.expectedError === undefined) {
			throw new Error(`[${testCase.name}] ${message}`)
		}
		if (!message.includes(testCase.expectedError)) {
			throw new Error(`[${testCase.name}] Ожидалась ошибка с подстрокой ${JSON.stringify(testCase.expectedError)}, получено: ${message}`)
		}
	}
}

function createRead(stdin: string | null): () => string | null {
	let consumed = false

	return () => {
		if (consumed) {
			return null
		}
		consumed = true

		return stdin
	}
}

function main(): void {
	for (const testCase of TEST_CASES) {
		runTestCase(testCase)
		console.log(`ok ${testCase.name}`)
	}
	console.log(`passed ${TEST_CASES.length} feature tests`)
}

main()
