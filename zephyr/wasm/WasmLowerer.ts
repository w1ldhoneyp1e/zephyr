import {
	type AssignmentStatementNode,
	type BinaryExpressionNode,
	type ExpressionNode,
	type FunctionDeclarationNode,
	type IdentifierExpressionNode,
	type LiteralExpressionNode,
	type ProgramNode,
	type ReturnStatementNode,
	type StatementNode,
	type TypeName,
	type UnaryExpressionNode,
	type VariableDeclarationNode,
	typeNameToString,
} from '../ast'
import {
	type WasmFunctionIr,
	type WasmInstruction,
	type WasmModuleIr,
} from './WasmIr'

type NumericBinaryOpcode = 'f64.add' | 'f64.sub' | 'f64.mul' | 'f64.div'

interface WasmLocalBinding {
	index: number,
}

interface FunctionLoweringContext {
	locals: Map<string, WasmLocalBinding>,
	localTypes: WasmFunctionIr['locals'],
}

function lowerProgramToWasmIr(program: ProgramNode): WasmModuleIr {
	return {
		functions: program.body
			.filter((statement): statement is FunctionDeclarationNode => statement.type === 'FunctionDeclaration')
			.map(lowerFunctionDeclaration),
	}
}

function lowerFunctionDeclaration(fn: FunctionDeclarationNode): WasmFunctionIr {
	assertNumberType(fn.returnTypeName, `return type of ${fn.name}`)
	const params = fn.params.map(param => {
		assertNumberType(param.typeName, `parameter ${param.name}`)
		return 'f64' as const
	})
	const context: FunctionLoweringContext = {
		locals: new Map(fn.params.map((param, index) => [param.name, {index}])),
		localTypes: [],
	}
	const body: WasmInstruction[] = []
	for (const statement of fn.body.statements) {
		body.push(...lowerStatement(statement, context))
	}

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
		case 'ReturnStatement':
			return lowerReturnStatement(statement, context)
		default:
			throw new Error(`Wasm lowering does not support statement ${statement.type}`)
	}
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
		...lowerExpression(statement.initializer, context),
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
		...lowerExpression(statement.value, context),
		{
			op: 'local.set',
			index: binding.index,
		},
	]
}

function lowerReturnStatement(statement: ReturnStatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	if (statement.value === null) {
		throw new Error('Wasm lowering requires return value')
	}

	return [
		...lowerExpression(statement.value, context),
		{
			op: 'return',
		},
	]
}

function lowerExpression(expression: ExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	switch (expression.type) {
		case 'LiteralExpression':
			return lowerLiteralExpression(expression)
		case 'IdentifierExpression':
			return lowerIdentifierExpression(expression, context)
		case 'UnaryExpression':
			return lowerUnaryExpression(expression, context)
		case 'BinaryExpression':
			return lowerBinaryExpression(expression, context)
		default:
			throw new Error(`Wasm lowering does not support expression ${expression.type}`)
	}
}

function lowerLiteralExpression(expression: LiteralExpressionNode): WasmInstruction[] {
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

function lowerIdentifierExpression(expression: IdentifierExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	return [
		{
			op: 'local.get',
			index: getLocal(context, expression.name).index,
		},
	]
}

function lowerUnaryExpression(expression: UnaryExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	if (expression.operator !== '-') {
		throw new Error(`Wasm lowering does not support unary operator ${expression.operator}`)
	}

	return [
		...lowerExpression(expression.argument, context),
		{
			op: 'f64.neg',
		},
	]
}

function lowerBinaryExpression(expression: BinaryExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	const op = getBinaryNumericOpcode(expression.operator)

	return [
		...lowerExpression(expression.left, context),
		...lowerExpression(expression.right, context),
		{
			op,
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
