import {
	type AssignmentStatementNode,
	type BinaryExpressionNode,
	type BlockStatementNode,
	type CallExpressionNode,
	type ExpressionNode,
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
}

interface FunctionLoweringContext {
	module: ModuleLoweringContext,
	locals: Map<string, WasmLocalBinding>,
	localTypes: WasmFunctionIr['locals'],
}

function lowerProgramToWasmIr(program: ProgramNode): WasmModuleIr {
	const functions = program.body
		.filter((statement): statement is FunctionDeclarationNode => statement.type === 'FunctionDeclaration')
	const context: ModuleLoweringContext = {
		functionIndices: new Map(functions.map((fn, index) => [fn.name, index])),
	}

	return {
		functions: functions.map(fn => lowerFunctionDeclaration(fn, context)),
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
		case 'ReturnStatement':
			return lowerReturnStatement(statement, context)
		default:
			throw new Error(`Wasm lowering does not support statement ${statement.type}`)
	}
}

function lowerBlockStatement(block: BlockStatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	return block.statements.flatMap(statement => lowerStatement(statement, context))
}

function lowerVariableDeclaration(statement: VariableDeclarationNode, context: FunctionLoweringContext): WasmInstruction[] {
	assertNumberType(statement.typeName, `variable ${statement.name}`)
	const index = context.locals.size
	context.locals.set(statement.name, {index})
	context.localTypes.push('f64')
	if (statement.initializer === null) {
		return [
			{
				op: 'f64.const',
				value: 0,
			},
			{
				op: 'local.set',
				index,
			},
		]
	}

	return [
		...lowerNumberExpression(statement.initializer, context),
		{
			op: 'local.set',
			index,
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

function assertNumberType(typeName: TypeName, context: string): void {
	const source = typeNameToString(typeName)
	if (source !== 'number') {
		throw new Error(`Wasm lowering only supports number type for ${context}`)
	}
}

export {
	lowerProgramToWasmIr,
}
