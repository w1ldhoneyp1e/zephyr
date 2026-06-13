import {
	type AssignmentStatementNode,
	type BinaryExpressionNode,
	type BlockStatementNode,
	type CallExpressionNode,
	type ExpressionNode,
	type ForRangeStatementNode,
	type FunctionDeclarationNode,
	type IdentifierExpressionNode,
	type IfStatementNode,
	type LiteralExpressionNode,
	type ProgramNode,
	type ReturnStatementNode,
	type StatementNode,
	type TypeName,
	type UnaryExpressionNode,
	type VariableDeclarationNode,
	type WhileStatementNode,
	typeNameToString,
} from '../ast'
import {
	type WasmFunctionIr,
	type WasmInstruction,
	type WasmModuleIr,
} from './WasmIr'

type NumericBinaryOpcode = 'f64.add' | 'f64.sub' | 'f64.mul' | 'f64.div'
type NumericComparisonOpcode = 'f64.eq' | 'f64.ne' | 'f64.lt' | 'f64.le' | 'f64.gt' | 'f64.ge'

interface WasmLocalBinding {
	index: number,
}

interface ModuleLoweringContext {
	functionIndices: Map<string, number>,
	usesMemory: boolean,
}

interface FunctionLoweringContext {
	module: ModuleLoweringContext,
	locals: Map<string, WasmLocalBinding>,
	localTypes: WasmFunctionIr['locals'],
	nextLocalIndex: number,
	nextInternalLocalId: number,
}

function lowerProgramToWasmIr(program: ProgramNode): WasmModuleIr {
	const functions = program.body
		.filter((statement): statement is FunctionDeclarationNode => statement.type === 'FunctionDeclaration')
	const context: ModuleLoweringContext = {
		functionIndices: new Map(functions.map((fn, index) => [fn.name, index])),
		usesMemory: false,
	}
	const loweredFunctions = functions.map(fn => lowerFunctionDeclaration(fn, context))

	return {
		memory: context.usesMemory
			? {
				minPages: 1,
				exportName: 'memory',
			}
			: undefined,
		functions: loweredFunctions,
	}
}

function lowerFunctionDeclaration(fn: FunctionDeclarationNode, moduleContext: ModuleLoweringContext): WasmFunctionIr {
	assertNumberType(fn.returnTypeName, `return type of ${fn.name}`)
	const params = fn.params.map(param => {
		assertNumberType(param.typeName, `parameter ${param.name}`)
		return 'f64' as const
	})
	const context: FunctionLoweringContext = {
		module: moduleContext,
		locals: new Map(fn.params.map((param, index) => [param.name, {index}])),
		localTypes: [],
		nextLocalIndex: fn.params.length,
		nextInternalLocalId: 0,
	}
	const body: WasmInstruction[] = []
	body.push(...lowerBlockStatement(fn.body, context))

	return {
		name: fn.name,
		params,
		result: 'f64',
		locals: context.localTypes,
		body,
		exported: true,
	}
}

function lowerStatement(statement: StatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	switch (statement.type) {
		case 'VariableDeclaration':
			return lowerVariableDeclaration(statement, context)
		case 'AssignmentStatement':
			return lowerAssignmentStatement(statement, context)
		case 'IfStatement':
			return lowerIfStatement(statement, context)
		case 'WhileStatement':
			return lowerWhileStatement(statement, context)
		case 'ForRangeStatement':
			return lowerForRangeStatement(statement, context)
		case 'ReturnStatement':
			return lowerReturnStatement(statement, context)
		case 'ExpressionStatement':
			return lowerExpressionStatement(statement.expression, context)
		default:
			throw new Error(`Wasm lowering does not support statement ${statement.type}`)
	}
}

function lowerBlockStatement(block: BlockStatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	return block.statements.flatMap(statement => lowerStatement(statement, context))
}

function lowerVariableDeclaration(statement: VariableDeclarationNode, context: FunctionLoweringContext): WasmInstruction[] {
	assertNumberType(statement.typeName, `variable ${statement.name}`)
	const binding = declareNumberLocal(context, statement.name)
	if (statement.initializer === null) {
		return [
			{
				op: 'f64.const',
				value: 0,
			},
			{
				op: 'local.set',
				index: binding.index,
			},
		]
	}

	return [
		...lowerNumberExpression(statement.initializer, context),
		{
			op: 'local.set',
			index: binding.index,
		},
	]
}

function lowerAssignmentStatement(statement: AssignmentStatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	if (statement.target.type !== 'IdentifierTarget') {
		throw new Error('Wasm lowering only supports identifier assignment targets')
	}
	const binding = getLocal(context, statement.target.name)

	return [
		...lowerNumberExpression(statement.value, context),
		{
			op: 'local.set',
			index: binding.index,
		},
	]
}

function lowerIfStatement(statement: IfStatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	return [
		...lowerBooleanExpression(statement.condition, context),
		{
			op: 'if',
			thenBody: lowerBlockStatement(statement.thenBranch, context),
			elseBody: statement.elseBranch === null
				? undefined
				: lowerBlockStatement(statement.elseBranch, context),
		},
	]
}

function lowerWhileStatement(statement: WhileStatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	return [
		{
			op: 'block',
			body: [
				{
					op: 'loop',
					body: [
						...lowerBooleanExpression(statement.condition, context),
						{
							op: 'i32.const',
							value: 0,
						},
						{
							op: 'i32.eq',
						},
						{
							op: 'br_if',
							labelIndex: 1,
						},
						...lowerBlockStatement(statement.body, context),
						{
							op: 'br',
							labelIndex: 0,
						},
					],
				},
			],
		},
	]
}

function lowerForRangeStatement(statement: ForRangeStatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	const previousIteratorBinding = context.locals.get(statement.iterator) ?? null
	const iteratorBinding = declareNumberLocal(context, statement.iterator)
	const endBinding = declareNumberLocal(context, createInternalLocalName(context, 'forEnd'))
	const body = lowerBlockStatement(statement.body, context)
	restoreLocalBinding(context, statement.iterator, previousIteratorBinding)

	return [
		...lowerNumberExpression(statement.start, context),
		{
			op: 'local.set',
			index: iteratorBinding.index,
		},
		...lowerNumberExpression(statement.end, context),
		{
			op: 'local.set',
			index: endBinding.index,
		},
		{
			op: 'block',
			body: [
				{
					op: 'loop',
					body: [
						{
							op: 'local.get',
							index: iteratorBinding.index,
						},
						{
							op: 'local.get',
							index: endBinding.index,
						},
						{
							op: 'f64.lt',
						},
						{
							op: 'i32.const',
							value: 0,
						},
						{
							op: 'i32.eq',
						},
						{
							op: 'br_if',
							labelIndex: 1,
						},
						...body,
						{
							op: 'local.get',
							index: iteratorBinding.index,
						},
						{
							op: 'f64.const',
							value: 1,
						},
						{
							op: 'f64.add',
						},
						{
							op: 'local.set',
							index: iteratorBinding.index,
						},
						{
							op: 'br',
							labelIndex: 0,
						},
					],
				},
			],
		},
	]
}

function lowerReturnStatement(statement: ReturnStatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	if (statement.value === null) {
		throw new Error('Wasm lowering requires return value')
	}

	return [
		...lowerNumberExpression(statement.value, context),
		{
			op: 'return',
		},
	]
}

function lowerExpressionStatement(expression: ExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	if (expression.type === 'CallExpression') {
		if (isStoreF64Call(expression)) {
			return lowerStoreF64Call(expression, context)
		}
		if (isStoreRecordF64Call(expression)) {
			return lowerStoreRecordF64Call(expression, context)
		}
	}

	return [
		...lowerNumberExpression(expression, context),
		{
			op: 'drop',
		},
	]
}

function lowerNumberExpression(expression: ExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	switch (expression.type) {
		case 'LiteralExpression':
			return lowerNumericLiteralExpression(expression)
		case 'IdentifierExpression':
			return lowerIdentifierExpression(expression, context)
		case 'UnaryExpression':
			return lowerNumericUnaryExpression(expression, context)
		case 'BinaryExpression':
			return lowerNumericBinaryExpression(expression, context)
		case 'CallExpression':
			return lowerCallExpression(expression, context)
		default:
			throw new Error(`Wasm lowering does not support numeric expression ${expression.type}`)
	}
}

function lowerBooleanExpression(expression: ExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	switch (expression.type) {
		case 'LiteralExpression':
			return lowerBooleanLiteralExpression(expression)
		case 'UnaryExpression':
			return lowerBooleanUnaryExpression(expression, context)
		case 'BinaryExpression':
			return lowerBooleanBinaryExpression(expression, context)
		default:
			throw new Error(`Wasm lowering does not support boolean expression ${expression.type}`)
	}
}

function lowerNumericLiteralExpression(expression: LiteralExpressionNode): WasmInstruction[] {
	if (typeof expression.value !== 'number') {
		throw new Error('Wasm lowering only supports numeric literals')
	}

	return [
		{
			op: 'f64.const',
			value: expression.value,
		},
	]
}

function lowerBooleanLiteralExpression(expression: LiteralExpressionNode): WasmInstruction[] {
	if (typeof expression.value !== 'boolean') {
		throw new Error('Wasm lowering only supports boolean literals in conditions')
	}

	return [
		{
			op: 'i32.const',
			value: expression.value
				? 1
				: 0,
		},
	]
}

function lowerIdentifierExpression(expression: IdentifierExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	return [
		{
			op: 'local.get',
			index: getLocal(context, expression.name).index,
		},
	]
}

function lowerNumericUnaryExpression(expression: UnaryExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	if (expression.operator !== '-') {
		throw new Error(`Wasm lowering does not support unary operator ${expression.operator}`)
	}

	return [
		...lowerNumberExpression(expression.argument, context),
		{
			op: 'f64.neg',
		},
	]
}

function lowerBooleanUnaryExpression(expression: UnaryExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	if (expression.operator !== '!') {
		throw new Error(`Wasm lowering does not support boolean unary operator ${expression.operator}`)
	}

	return [
		...lowerBooleanExpression(expression.argument, context),
		{
			op: 'i32.const',
			value: 0,
		},
		{
			op: 'i32.eq',
		},
	]
}

function lowerNumericBinaryExpression(expression: BinaryExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	const op = getBinaryNumericOpcode(expression.operator)

	return [
		...lowerNumberExpression(expression.left, context),
		...lowerNumberExpression(expression.right, context),
		{
			op,
		},
	]
}

function lowerBooleanBinaryExpression(expression: BinaryExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	const op = getNumericComparisonOpcode(expression.operator)

	return [
		...lowerNumberExpression(expression.left, context),
		...lowerNumberExpression(expression.right, context),
		{
			op,
		},
	]
}

function lowerCallExpression(expression: CallExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	if (isLoadF64Call(expression)) {
		return lowerLoadF64Call(expression, context)
	}
	if (isLoadRecordF64Call(expression)) {
		return lowerLoadRecordF64Call(expression, context)
	}
	if (isStoreF64Call(expression)) {
		throw new Error('Wasm lowering only supports storeF64 as an expression statement')
	}
	if (isStoreRecordF64Call(expression)) {
		throw new Error('Wasm lowering only supports storeRecordF64 as an expression statement')
	}
	if (expression.callee.type !== 'IdentifierExpression') {
		throw new Error('Wasm lowering only supports direct function calls')
	}
	const functionIndex = context.module.functionIndices.get(expression.callee.name)
	if (functionIndex === undefined) {
		throw new Error(`Unknown function ${expression.callee.name}`)
	}

	return [
		...expression.args.flatMap(arg => lowerNumberExpression(arg, context)),
		{
			op: 'call',
			functionIndex,
		},
	]
}

function lowerLoadF64Call(expression: CallExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	assertArgumentCount(expression, 1, 'loadF64')
	context.module.usesMemory = true

	return [
		...lowerAddressExpression(expression.args[0], context),
		{
			op: 'f64.load',
			align: 3,
			offset: 0,
		},
	]
}

function lowerStoreF64Call(expression: CallExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	assertArgumentCount(expression, 2, 'storeF64')
	context.module.usesMemory = true

	return [
		...lowerAddressExpression(expression.args[0], context),
		...lowerNumberExpression(expression.args[1], context),
		{
			op: 'f64.store',
			align: 3,
			offset: 0,
		},
	]
}

function lowerLoadRecordF64Call(expression: CallExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	assertArgumentCount(expression, 4, 'loadRecordF64')
	context.module.usesMemory = true

	return [
		...lowerRecordFieldAddressExpression(expression, context),
		{
			op: 'f64.load',
			align: 3,
			offset: 0,
		},
	]
}

function lowerStoreRecordF64Call(expression: CallExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	assertArgumentCount(expression, 5, 'storeRecordF64')
	context.module.usesMemory = true

	return [
		...lowerRecordFieldAddressExpression(expression, context),
		...lowerNumberExpression(expression.args[4], context),
		{
			op: 'f64.store',
			align: 3,
			offset: 0,
		},
	]
}

function lowerAddressExpression(expression: ExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	return [
		...lowerNumberExpression(expression, context),
		{
			op: 'i32.trunc_f64_s',
		},
	]
}

function lowerRecordFieldAddressExpression(expression: CallExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	const [base, index, rowSize, fieldOffset] = expression.args

	return lowerAddressExpression({
		type: 'BinaryExpression',
		operator: '+',
		left: {
			type: 'BinaryExpression',
			operator: '+',
			left: base,
			right: {
				type: 'BinaryExpression',
				operator: '*',
				left: index,
				right: rowSize,
			},
		},
		right: fieldOffset,
	}, context)
}

function isLoadF64Call(expression: CallExpressionNode): boolean {
	return expression.callee.type === 'IdentifierExpression'
		&& expression.callee.name === 'loadF64'
}

function isLoadRecordF64Call(expression: CallExpressionNode): boolean {
	return expression.callee.type === 'IdentifierExpression'
		&& expression.callee.name === 'loadRecordF64'
}

function isStoreF64Call(expression: CallExpressionNode): boolean {
	return expression.callee.type === 'IdentifierExpression'
		&& expression.callee.name === 'storeF64'
}

function isStoreRecordF64Call(expression: CallExpressionNode): boolean {
	return expression.callee.type === 'IdentifierExpression'
		&& expression.callee.name === 'storeRecordF64'
}

function assertArgumentCount(expression: CallExpressionNode, expected: number, name: string): void {
	if (expression.args.length !== expected) {
		throw new Error(`Wasm intrinsic ${name} expects ${expected} arguments, got ${expression.args.length}`)
	}
}

function getBinaryNumericOpcode(operator: BinaryExpressionNode['operator']): NumericBinaryOpcode {
	switch (operator) {
		case '+':
			return 'f64.add'
		case '-':
			return 'f64.sub'
		case '*':
			return 'f64.mul'
		case '/':
			return 'f64.div'
		default:
			throw new Error(`Wasm lowering does not support binary operator ${operator}`)
	}
}

function getNumericComparisonOpcode(operator: BinaryExpressionNode['operator']): NumericComparisonOpcode {
	switch (operator) {
		case '==':
			return 'f64.eq'
		case '!=':
			return 'f64.ne'
		case '<':
			return 'f64.lt'
		case '<=':
			return 'f64.le'
		case '>':
			return 'f64.gt'
		case '>=':
			return 'f64.ge'
		default:
			throw new Error(`Wasm lowering does not support boolean operator ${operator}`)
	}
}

function getLocal(context: FunctionLoweringContext, name: string): WasmLocalBinding {
	const binding = context.locals.get(name)
	if (binding === undefined) {
		throw new Error(`Unknown local ${name}`)
	}

	return binding
}

function declareNumberLocal(context: FunctionLoweringContext, name: string): WasmLocalBinding {
	const binding = {
		index: context.nextLocalIndex,
	}
	context.nextLocalIndex++
	context.locals.set(name, binding)
	context.localTypes.push('f64')

	return binding
}

function createInternalLocalName(context: FunctionLoweringContext, prefix: string): string {
	const id = context.nextInternalLocalId
	context.nextInternalLocalId++

	return `__wasm_${prefix}_${id}`
}

function restoreLocalBinding(context: FunctionLoweringContext, name: string, binding: WasmLocalBinding | null): void {
	if (binding === null) {
		context.locals.delete(name)
		return
	}
	context.locals.set(name, binding)
}

function assertNumberType(typeName: TypeName, context: string): void {
	const source = typeNameToString(typeName)
	if (source !== 'number') {
		throw new Error(`Wasm lowering only supports number type for ${context}`)
	}
}

export {
	lowerProgramToWasmIr,
}
