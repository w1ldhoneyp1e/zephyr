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
		name: 'class_private_access_ok',
		file: 'class_private_access_ok.zph',
		expectedReturn: '5',
	},
	{
		name: 'class_inheritance',
		file: 'class_inheritance.zph',
		expectedReturn: '9',
	},
	{
		name: 'class_super_method',
		file: 'class_super_method.zph',
		expectedReturn: '6',
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
		name: 'typed_arrays',
		file: 'typed_arrays.zph',
		expectedReturn: '11',
	},
	{
		name: 'union_types',
		file: 'union_types.zph',
		expectedReturn: '3',
	},
	{
		name: 'null_narrowing',
		file: 'null_narrowing.zph',
		expectedReturn: '12',
	},
	{
		name: 'trailing_comma',
		file: 'trailing_comma.zph',
		expectedReturn: '4',
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
		expectedStdout: 'line\n',
	},
	{
		name: 'read_and_readf',
		file: 'read_and_readf.zph',
		expectedReturn: '105',
		stdin: '5',
	},
	{
		name: 'typed_variables_and_fields',
		file: 'typed_variables_and_fields.zph',
		expectedReturn: '17',
	},
	{
		name: 'typed_parameters_and_returns',
		file: 'typed_parameters_and_returns.zph',
		expectedReturn: null,
		expectedStdout: '17\n',
	},
	{
		name: 'typed_callback',
		file: 'typed_callback.zph',
		expectedReturn: '5',
	},
	{
		name: 'lambda_callback',
		file: 'lambda_callback.zph',
		expectedReturn: '7',
	},
	{
		name: 'lambda_capture',
		file: 'lambda_capture.zph',
		expectedReturn: '7',
	},
	{
		name: 'lambda_block_body',
		file: 'lambda_block_body.zph',
		expectedReturn: '7',
	},
	{
		name: 'choose_expression',
		file: 'choose_expression.zph',
		expectedReturn: '4',
	},
	{
		name: 'collect_expression',
		file: 'collect_expression.zph',
		expectedReturn: '3',
	},
	{
		name: 'match_expression',
		file: 'match_expression.zph',
		expectedReturn: '20',
	},
	{
		name: 'match_by_expression',
		file: 'match_by_expression.zph',
		expectedReturn: '7',
	},
	{
		name: 'match_by_narrowing',
		file: 'match_by_narrowing.zph',
		expectedReturn: '9',
	},
	{
		name: 'pipeline_expression',
		file: 'pipeline_expression.zph',
		expectedReturn: '18',
	},
	{
		name: 'pipeline_lambda_expression',
		file: 'pipeline_lambda_expression.zph',
		expectedReturn: '28',
	},
	{
		name: 'modules_basic',
		file: 'modules/main.zph',
		expectedReturn: '8',
	},
	{
		name: 'modules_reexport',
		file: 'modules_reexport/main.zph',
		expectedReturn: '7',
	},
	{
		name: 'type_mismatch_error',
		file: 'type_mismatch_error.zph',
		expectedError: 'Несовместимые типы в инициализатор переменной a: ожидалось number, получено string',
	},
	{
		name: 'modules_missing_export_error',
		file: 'modules_missing_export/main.zph',
		expectedError: 'Модуль tests/fixtures/modules_missing_export/main.zph импортирует sub из tests/fixtures/modules_missing_export/math.zph, но этот модуль его не экспортирует',
	},
	{
		name: 'return_type_mismatch_error',
		file: 'return_type_mismatch_error.zph',
		expectedError: 'Несовместимые типы в return в функции bad: ожидалось number, получено string',
	},
	{
		name: 'call_argument_type_mismatch_error',
		file: 'call_argument_type_mismatch_error.zph',
		expectedError: 'Несовместимые типы в вызов функции add, аргумент 2: ожидалось number, получено string',
	},
	{
		name: 'call_arity_mismatch_error',
		file: 'call_arity_mismatch_error.zph',
		expectedError: 'Неверное число аргументов в создание класса Point: ожидалось 2, получено 1',
	},
	{
		name: 'typed_callback_mismatch_error',
		file: 'typed_callback_mismatch_error.zph',
		expectedError: 'Несовместимые типы в вызов функции apply, аргумент 1: ожидалось (number) => number, получено (string) => number',
	},
	{
		name: 'typed_array_element_mismatch_error',
		file: 'typed_array_element_mismatch_error.zph',
		expectedError: 'Несовместимые типы в присваивание элемента массива: ожидалось number, получено string',
	},
	{
		name: 'union_type_mismatch_error',
		file: 'union_type_mismatch_error.zph',
		expectedError: 'Несовместимые типы в инициализатор переменной value: ожидалось number | string, получено boolean',
	},
	{
		name: 'break_outside_loop_error',
		file: 'break_outside_loop_error.zph',
		expectedError: 'Нельзя использовать break вне цикла',
	},
	{
		name: 'class_private_access_error',
		file: 'class_private_access_error.zph',
		expectedError: 'Нельзя обращаться к private-члену Counter.value вне класса Counter',
	},
]

function runTestCase(testCase: FeatureTestCase): void {
	const fixturePath = path.resolve(__dirname, 'fixtures', testCase.file)
	const compiler = new Compiler()
	const writes: string[] = []

	try {
		const programs = compiler.compilePath(fixturePath)
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
