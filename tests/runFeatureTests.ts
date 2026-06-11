import * as fs from 'fs'
import * as path from 'path'
import {formatValue, Vm} from '../vm'
import {Compiler} from '../zephyr/Compiler'
import {diagnosticToMessage} from '../zephyr/diagnostics'

interface FeatureTestCase {
	name: string,
	file: string,
	expectedReturn?: string | null,
	expectedStdout?: string,
	stdin?: string | null,
	expectedError?: string,
	expectedFile?: {
		path: string,
		content: string,
	},
}

const TEST_CASES: FeatureTestCase[] = [
	{
		name: 'class_method',
		file: './class/class_method.zph',
		expectedReturn: '5',
	},
	{
		name: 'class_field_assignment',
		file: './class/class_field_assignment.zph',
		expectedReturn: '15',
	},
	{
		name: 'class_private_access_ok',
		file: './class/class_private_access_ok.zph',
		expectedReturn: '5',
	},
	{
		name: 'class_inheritance',
		file: './class/class_inheritance.zph',
		expectedReturn: '9',
	},
	{
		name: 'class_super_method',
		file: './class/class_super_method.zph',
		expectedReturn: '6',
	},
	{
		name: 'matrix_read',
		file: './collections/matrix_read.zph',
		expectedReturn: '4',
	},
	{
		name: 'matrix_write',
		file: './collections/matrix_write.zph',
		expectedReturn: '9',
	},
	{
		name: 'typed_arrays',
		file: './typification/typed_arrays.zph',
		expectedReturn: '11',
	},
	{
		name: 'union_types',
		file: './typification/union_types.zph',
		expectedReturn: '3',
	},
	{
		name: 'null_narrowing',
		file: 'null_narrowing.zph',
		expectedReturn: '12',
	},
	{
		name: 'trailing_comma',
		file: './syntax-sugar/trailing_comma.zph',
		expectedReturn: '4',
	},
	{
		name: 'nullish_coalescing',
		file: './syntax-sugar/nullish_coalescing.zph',
		expectedReturn: '7',
	},
	{
		name: 'optional_chaining',
		file: './syntax-sugar/optional_chaining.zph',
		expectedReturn: '3',
	},
	{
		name: 'optional_type_inference',
		file: './syntax-sugar/optional_type_inference.zph',
		expectedReturn: '6',
	},
	{
		name: 'loop_control',
		file: './loop/loop_control.zph',
		expectedReturn: '8',
	},
	{
		name: 'print_stdout',
		file: './io/print_stdout.zph',
		expectedReturn: '0',
		expectedStdout: 'line\n',
	},
	{
		name: 'print_values_stdout',
		file: './io/print_values_stdout.zph',
		expectedReturn: '0',
		expectedStdout: 'hello\n42\ntrue\nnull\n',
	},
	{
		name: 'read_stdin',
		file: './io/read_stdin.zph',
		expectedReturn: 'input-value',
		stdin: 'input-value',
	},
	{
		name: 'read_and_readf',
		file: './io/read_and_readf.zph',
		expectedReturn: '105',
		stdin: '5',
	},
	{
		name: 'readf_file',
		file: './io/readf_file.zph',
		expectedReturn: 'file-value',
	},
	{
		name: 'printf_file',
		file: './io/printf_file.zph',
		expectedReturn: null,
		expectedFile: {
			path: '/tmp/zephyr_printf_fixture.txt',
			content: 'file-output',
		},
	},
	{
		name: 'typed_variables_and_fields',
		file: './typification/typed_variables_and_fields.zph',
		expectedReturn: '17',
	},
	{
		name: 'typed_parameters_and_returns',
		file: './typification/typed_parameters_and_returns.zph',
		expectedReturn: null,
		expectedStdout: '17\n',
	},
	{
		name: 'typed_callback',
		file: './typification/typed_callback.zph',
		expectedReturn: '5',
	},
	{
		name: 'lambda_callback',
		file: './functions/lambda_callback.zph',
		expectedReturn: '7',
	},
	{
		name: 'lambda_capture',
		file: './functions/lambda_capture.zph',
		expectedReturn: '7',
	},
	{
		name: 'lambda_block_body',
		file: './functions/lambda_block_body.zph',
		expectedReturn: '7',
	},
	{
		name: 'choose_expression',
		file: './syntax-sugar/choose_expression.zph',
		expectedReturn: '4',
	},
	{
		name: 'collect_expression',
		file: './syntax-sugar/collect_expression.zph',
		expectedReturn: '3',
	},
	{
		name: 'match_expression',
		file: './match/match_expression.zph',
		expectedReturn: '20',
	},
	{
		name: 'match_by_expression',
		file: './match/match_by_expression.zph',
		expectedReturn: '7',
	},
	{
		name: 'match_by_narrowing',
		file: './match/match_by_narrowing.zph',
		expectedReturn: '9',
	},
	{
		name: 'match_by_exhaustive',
		file: './match/match_by_exhaustive.zph',
		expectedReturn: '11',
	},
	{
		name: 'match_by_union_exhaustive',
		file: './match/match_by_union_exhaustive.zph',
		expectedReturn: '13',
	},
	{
		name: 'match_by_ambiguous_discriminant',
		file: './match/match_by_ambiguous_discriminant.zph',
		expectedReturn: '1',
	},
	{
		name: 'type_alias_union',
		file: './typification/type_alias_union.zph',
		expectedReturn: '17',
	},
	{
		name: 'type_alias_callback',
		file: './typification/type_alias_callback.zph',
		expectedReturn: '12',
	},
	{
		name: 'type_alias_forward_reference',
		file: './typification/type_alias_forward_reference.zph',
		expectedReturn: '19',
	},
	{
		name: 'object_type_method_contract',
		file: './typification/object_type_method_contract.zph',
		expectedReturn: '21',
	},
	{
		name: 'object_type_field_contract',
		file: './typification/object_type_field_contract.zph',
		expectedReturn: 'Ada',
	},
	{
		name: 'parenthesized_union_array_type',
		file: './syntax-sugar/parenthesized_union_array_type.zph',
		expectedReturn: '7',
	},
	{
		name: 'parenthesized_function_array_type',
		file: './syntax-sugar/parenthesized_function_array_type.zph',
		expectedReturn: '12',
	},
	{
		name: 'contextual_lambda_argument',
		file: './functions/contextual_lambda_argument.zph',
		expectedReturn: '12',
	},
	{
		name: 'contextual_lambda_variable',
		file: './functions/contextual_lambda_variable.zph',
		expectedReturn: '11',
	},
	{
		name: 'contextual_lambda_return',
		file: './functions/contextual_lambda_return.zph',
		expectedReturn: '12',
	},
	{
		name: 'if_discriminant_narrowing',
		file: './if/if_discriminant_narrowing.zph',
		expectedReturn: '23',
	},
	{
		name: 'if_discriminant_else_narrowing',
		file: './if/if_discriminant_else_narrowing.zph',
		expectedReturn: '29',
	},
	{
		name: 'if_discriminant_not_equal_narrowing',
		file: './if/if_discriminant_not_equal_narrowing.zph',
		expectedReturn: '31',
	},
	{
		name: 'if_and_nullable_discriminant_narrowing',
		file: './if/if_and_nullable_discriminant_narrowing.zph',
		expectedReturn: '37',
	},
	{
		name: 'if_or_else_nullable_discriminant_narrowing',
		file: './if/if_or_else_nullable_discriminant_narrowing.zph',
		expectedReturn: '41',
	},
	{
		name: 'generic_identity_function',
		file: 'generic_identity_function.zph',
		expectedReturn: '42',
	},
	{
		name: 'generic_first_function',
		file: 'generic_first_function.zph',
		expectedReturn: '8',
	},
	{
		name: 'pipeline_expression',
		file: './syntax-sugar/pipeline_expression.zph',
		expectedReturn: '18',
	},
	{
		name: 'pipeline_lambda_expression',
		file: './syntax-sugar/pipeline_lambda_expression.zph',
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
		file: './typification/type_mismatch_error.zph',
		expectedError: 'Несовместимые типы в инициализатор переменной a: ожидалось number, получено string',
	},
	{
		name: 'modules_missing_export_error',
		file: 'modules_missing_export/main.zph',
		expectedError: 'Модуль tests/fixtures/modules_missing_export/main.zph импортирует sub из tests/fixtures/modules_missing_export/math.zph, но этот модуль его не экспортирует',
	},
	{
		name: 'return_type_mismatch_error',
		file: './typification/return_type_mismatch_error.zph',
		expectedError: 'Несовместимые типы в return в функции bad: ожидалось number, получено string',
	},
	{
		name: 'call_argument_type_mismatch_error',
		file: './functions/call_argument_type_mismatch_error.zph',
		expectedError: 'Несовместимые типы в вызов функции add, аргумент 2: ожидалось number, получено string',
	},
	{
		name: 'call_arity_mismatch_error',
		file: './functions/call_arity_mismatch_error.zph',
		expectedError: 'Неверное число аргументов в создание класса Point: ожидалось 2, получено 1',
	},
	{
		name: 'typed_callback_mismatch_error',
		file: './typification/typed_callback_mismatch_error.zph',
		expectedError: 'Несовместимые типы в вызов функции apply, аргумент 1: ожидалось (number) => number, получено (string) => number',
	},
	{
		name: 'typed_array_element_mismatch_error',
		file: './typification/typed_array_element_mismatch_error.zph',
		expectedError: 'Несовместимые типы в присваивание элемента массива: ожидалось number, получено string',
	},
	{
		name: 'union_type_mismatch_error',
		file: './typification/union_type_mismatch_error.zph',
		expectedError: 'Несовместимые типы в инициализатор переменной value: ожидалось number | string, получено boolean',
	},
	{
		name: 'null_member_access_error',
		file: './syntax-sugar/null_member_access_error.zph',
		expectedError: 'Нельзя обращаться к члену get у nullable-типа Box | null',
	},
	{
		name: 'optional_member_type_error',
		file: './syntax-sugar/optional_member_type_error.zph',
		expectedError: 'Несовместимые типы в инициализатор переменной value: ожидалось number, получено number | null',
	},
	{
		name: 'break_outside_loop_error',
		file: './loop/break_outside_loop_error.zph',
		expectedError: 'Нельзя использовать break вне цикла',
	},
	{
		name: 'class_private_access_error',
		file: './class/class_private_access_error.zph',
		expectedError: 'Нельзя обращаться к private-члену Counter.value вне класса Counter',
	},
	{
		name: 'match_by_exhaustive_error',
		file: './match/match_by_exhaustive_error.zph',
		expectedError: 'match by kind не покрывает варианты: cat',
	},
	{
		name: 'match_by_union_exhaustive_error',
		file: './match/match_by_union_exhaustive_error.zph',
		expectedError: 'match by kind не покрывает варианты: cat',
	},
	{
		name: 'match_by_duplicate_branch_error',
		file: './match/match_by_duplicate_branch_error.zph',
		expectedError: 'match by kind содержит дублирующую ветку: dog',
	},
	{
		name: 'match_by_impossible_branch_error',
		file: './match/match_by_impossible_branch_error.zph',
		expectedError: 'match by kind содержит невозможную ветку: bird',
	},
	{
		name: 'type_alias_mismatch_error',
		file: './typification/type_alias_mismatch_error.zph',
		expectedError: 'Несовместимые типы в инициализатор переменной value: ожидалось number | string, получено boolean',
	},
	{
		name: 'unknown_type_error',
		file: './typification/unknown_type_error.zph',
		expectedError: 'Неизвестный тип: Numbre',
	},
	{
		name: 'unknown_type_alias_error',
		file: './typification/unknown_type_alias_error.zph',
		expectedError: 'Неизвестный тип: MissingType',
	},
	{
		name: 'unknown_variables_recovery',
		file: './typification/unknown_variables_recovery.zph',
		expectedError: 'Неизвестная переменная: missingB',
	},
	{
		name: 'type_alias_cycle_error',
		file: './typification/type_alias_cycle_error.zph',
		expectedError: 'Циклический type alias',
	},
	{
		name: 'contextual_array_element_error',
		file: 'contextual_array_element_error.zph',
		expectedError: 'Несовместимые типы в инициализатор переменной values: ожидалось number[], получено (number | string)[]',
	},
	{
		name: 'object_type_contract_error',
		file: './typification/object_type_contract_error.zph',
		expectedError: 'отсутствует член score',
	},
	{
		name: 'object_type_member_type_error',
		file: './typification/object_type_member_type_error.zph',
		expectedError: 'член score: ожидалось () => number, получено () => string',
	},
]

function runTestCase(testCase: FeatureTestCase): void {
	const fixturePath = path.resolve(__dirname, 'fixtures', testCase.file)
	const compiler = new Compiler()
	const writes: string[] = []
	if (testCase.expectedFile !== undefined && fs.existsSync(testCase.expectedFile.path)) {
		fs.unlinkSync(testCase.expectedFile.path)
	}

	try {
		const compileResult = compiler.compilePath(fixturePath)
		if (!compileResult.ok) {
			throw new Error(compileResult.diagnostics.map(diagnosticToMessage).join('\n'))
		}
		const programs = compileResult.programs
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

		if (testCase.expectedFile !== undefined) {
			const actualContent = fs.existsSync(testCase.expectedFile.path)
				? fs.readFileSync(testCase.expectedFile.path, 'utf-8')
				: null
			if (actualContent !== testCase.expectedFile.content) {
				throw new Error(`Неверный файл ${testCase.expectedFile.path}. Ожидалось: ${JSON.stringify(testCase.expectedFile.content)}, получено: ${JSON.stringify(actualContent)}`)
			}
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
