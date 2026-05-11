import {
	type ArrayExpressionNode,
	type AssignmentStatementNode,
	type AssignmentTargetNode,
	type BinaryExpressionNode,
	type BlockStatementNode,
	type CallExpressionNode,
	type ExpressionNode,
	type ExpressionStatementNode,
	type ForRangeStatementNode,
	type FunctionDeclarationNode,
	type IdentifierExpressionNode,
	type IdentifierTargetNode,
	type IfStatementNode,
	type IndexExpressionNode,
	type IndexTargetNode,
	type LiteralExpressionNode,
	type ProgramNode,
	type ReturnStatementNode,
	type StatementNode,
	type UnaryExpressionNode,
	type VariableDeclarationNode,
	type WhileStatementNode,
} from '../ast'
import {type Token, TokenType} from '../token'
import {type Grammar, type Production} from './grammar'
import {type SemanticAction} from './TableParser'

type SemanticValue =
	| null
	| string
	| string[]
	| ExpressionNode[]
	| ProgramNode
	| ExpressionNode
	| StatementNode
	| StatementNode[]
	| PendingAssignmentNode

interface PendingAssignmentNode {
	type: 'PendingAssignment',
	target: ExpressionNode,
	value: ExpressionNode,
}

function createSemanticActions(grammar: Grammar): Partial<Record<number, SemanticAction>> {
	const actions: Partial<Record<number, SemanticAction>> = {}
	for (const production of grammar.productions) {
		const action = createActionForProduction(production)
		if (action !== null) {
			actions[production.id] = action as SemanticAction
		}
	}

	return actions
}

function createActionForProduction(production: Production): ((values: SemanticValue[]) => SemanticValue) | null {
	switch (productionKey(production)) {
		case 'Program -> StatementList':
			return values => ({
				type: 'Program',
				body: values[0] as StatementNode[],
			} satisfies ProgramNode)

		case 'StatementList -> StatementList Statement':
			return values => [...(values[0] as StatementNode[]), values[1] as StatementNode]
		case 'StatementList -> ε':
			return () => []

		case 'Statement -> VariableDeclaration':
		case 'Statement -> FunctionDeclaration':
		case 'Statement -> IfStatement':
		case 'Statement -> WhileStatement':
		case 'Statement -> ForRangeStatement':
		case 'Statement -> ReturnStatement':
		case 'Statement -> BlockStatement':
		case 'Statement -> ExpressionStatement':
			return values => values[0]

		case 'VariableDeclaration -> Var Identifier VariableInitializerOpt Semicolon':
			return values => createVariableDeclaration('var', tokenLexeme(values[1]), values[2] as ExpressionNode | null)
		case 'VariableDeclaration -> Const Identifier VariableInitializerOpt Semicolon':
			return values => createVariableDeclaration('const', tokenLexeme(values[1]), values[2] as ExpressionNode | null)
		case 'VariableInitializerOpt -> Equal Expression':
			return values => ensureExpression(values[1], 'initializer')
		case 'VariableInitializerOpt -> ε':
			return () => null

		case 'FunctionDeclaration -> Fn Identifier LeftParen ParameterListOpt RightParen BlockStatement':
			return values => ({
				type: 'FunctionDeclaration',
				name: tokenLexeme(values[1]),
				params: values[3] as string[],
				body: values[5] as BlockStatementNode,
			} satisfies FunctionDeclarationNode)
		case 'ParameterListOpt -> ParameterList':
			return values => values[0]
		case 'ParameterListOpt -> ε':
			return () => []
		case 'ParameterList -> ParameterList Comma Identifier':
			return values => [...(values[0] as string[]), tokenLexeme(values[2])]
		case 'ParameterList -> Identifier':
			return values => [tokenLexeme(values[0])]

		case 'IfStatement -> If LeftParen Expression RightParen BlockStatement ElseBranchOpt':
			return values => ({
				type: 'IfStatement',
				condition: ensureExpression(values[2], 'if condition'),
				thenBranch: values[4] as BlockStatementNode,
				elseBranch: values[5] as BlockStatementNode | null,
			} satisfies IfStatementNode)
		case 'ElseBranchOpt -> Else BlockStatement':
			return values => values[1]
		case 'ElseBranchOpt -> ε':
			return () => null

		case 'WhileStatement -> While LeftParen Expression RightParen BlockStatement':
			return values => ({
				type: 'WhileStatement',
				condition: ensureExpression(values[2], 'while condition'),
				body: values[4] as BlockStatementNode,
			} satisfies WhileStatementNode)

		case 'ForRangeStatement -> For LeftParen Identifier In Expression Range Expression RightParen BlockStatement':
			return values => ({
				type: 'ForRangeStatement',
				iterator: tokenLexeme(values[2]),
				start: ensureExpression(values[4], 'for range start'),
				end: ensureExpression(values[6], 'for range end'),
				body: values[8] as BlockStatementNode,
			} satisfies ForRangeStatementNode)

		case 'ReturnStatement -> Return ReturnValueOpt Semicolon':
			return values => ({
				type: 'ReturnStatement',
				value: values[1] as ExpressionNode | null,
			} satisfies ReturnStatementNode)
		case 'ReturnValueOpt -> Expression':
			return values => ensureExpression(values[0], 'return value')
		case 'ReturnValueOpt -> ε':
			return () => null

		case 'BlockStatement -> LeftBrace StatementList RightBrace':
			return values => ({
				type: 'BlockStatement',
				statements: values[1] as StatementNode[],
			} satisfies BlockStatementNode)

		case 'ExpressionStatement -> Expression Semicolon':
			return values => {
				const expression = values[0]
				if (isPendingAssignment(expression)) {
					return {
						type: 'AssignmentStatement',
						target: expressionToAssignmentTarget(expression.target),
						value: expression.value,
					} satisfies AssignmentStatementNode
				}

				return {
					type: 'ExpressionStatement',
					expression: ensureExpression(expression, 'expression statement'),
				} satisfies ExpressionStatementNode
			}

		case 'Expression -> AssignmentExpression':
		case 'AssignmentExpression -> OrExpression':
		case 'OrExpression -> AndExpression':
		case 'AndExpression -> EqualityExpression':
		case 'EqualityExpression -> ComparisonExpression':
		case 'ComparisonExpression -> TermExpression':
		case 'TermExpression -> FactorExpression':
		case 'FactorExpression -> UnaryExpression':
		case 'UnaryExpression -> PostfixExpression':
		case 'PostfixExpression -> PrimaryExpression':
		case 'ArgumentListOpt -> ArgumentList':
		case 'ArrayElementsOpt -> ArrayElements':
			return values => values[0]

		case 'AssignmentExpression -> PostfixExpression Equal AssignmentExpression':
			return values => ({
				type: 'PendingAssignment',
				target: ensureExpression(values[0], 'assignment target'),
				value: ensureExpression(values[2], 'assignment value'),
			} satisfies PendingAssignmentNode)

		case 'OrExpression -> OrExpression OrOr AndExpression':
			return values => createBinary('||', values[0], values[2])
		case 'AndExpression -> AndExpression AndAnd EqualityExpression':
			return values => createBinary('&&', values[0], values[2])
		case 'EqualityExpression -> EqualityExpression EqualEqual ComparisonExpression':
			return values => createBinary('==', values[0], values[2])
		case 'EqualityExpression -> EqualityExpression BangEqual ComparisonExpression':
			return values => createBinary('!=', values[0], values[2])
		case 'ComparisonExpression -> ComparisonExpression Less TermExpression':
			return values => createBinary('<', values[0], values[2])
		case 'ComparisonExpression -> ComparisonExpression LessEqual TermExpression':
			return values => createBinary('<=', values[0], values[2])
		case 'ComparisonExpression -> ComparisonExpression Greater TermExpression':
			return values => createBinary('>', values[0], values[2])
		case 'ComparisonExpression -> ComparisonExpression GreaterEqual TermExpression':
			return values => createBinary('>=', values[0], values[2])
		case 'TermExpression -> TermExpression Plus FactorExpression':
			return values => createBinary('+', values[0], values[2])
		case 'TermExpression -> TermExpression Minus FactorExpression':
			return values => createBinary('-', values[0], values[2])
		case 'FactorExpression -> FactorExpression Star UnaryExpression':
			return values => createBinary('*', values[0], values[2])
		case 'FactorExpression -> FactorExpression Slash UnaryExpression':
			return values => createBinary('/', values[0], values[2])
		case 'FactorExpression -> FactorExpression Percent UnaryExpression':
			return values => createBinary('%', values[0], values[2])

		case 'UnaryExpression -> Bang UnaryExpression':
			return values => createUnary('!', values[1])
		case 'UnaryExpression -> Minus UnaryExpression':
			return values => createUnary('-', values[1])

		case 'PostfixExpression -> PostfixExpression LeftParen ArgumentListOpt RightParen':
			return values => ({
				type: 'CallExpression',
				callee: ensureExpression(values[0], 'call callee'),
				args: values[2] as ExpressionNode[],
			} satisfies CallExpressionNode)
		case 'PostfixExpression -> PostfixExpression LeftBracket Expression RightBracket':
			return values => ({
				type: 'IndexExpression',
				object: ensureExpression(values[0], 'index object'),
				index: ensureExpression(values[2], 'index expression'),
			} satisfies IndexExpressionNode)
		case 'ArgumentListOpt -> ε':
			return () => []
		case 'ArgumentList -> ArgumentList Comma Expression':
			return values => [...(values[0] as ExpressionNode[]), ensureExpression(values[2], 'argument')]
		case 'ArgumentList -> Expression':
			return values => [ensureExpression(values[0], 'argument')]

		case 'PrimaryExpression -> False':
			return () => ({
				type: 'LiteralExpression',
				value: false,
			} satisfies LiteralExpressionNode)
		case 'PrimaryExpression -> True':
			return () => ({
				type: 'LiteralExpression',
				value: true,
			} satisfies LiteralExpressionNode)
		case 'PrimaryExpression -> Number':
			return values => ({
				type: 'LiteralExpression',
				value: Number(tokenLexeme(values[0])),
			} satisfies LiteralExpressionNode)
		case 'PrimaryExpression -> String':
			return values => ({
				type: 'LiteralExpression',
				value: unquoteString(tokenLexeme(values[0])),
			} satisfies LiteralExpressionNode)
		case 'PrimaryExpression -> Identifier':
			return values => ({
				type: 'IdentifierExpression',
				name: tokenLexeme(values[0]),
			} satisfies IdentifierExpressionNode)
		case 'PrimaryExpression -> LeftParen Expression RightParen':
			return values => ensureExpression(values[1], 'grouped expression')
		case 'PrimaryExpression -> LeftBracket ArrayElementsOpt RightBracket':
			return values => ({
				type: 'ArrayExpression',
				elements: values[1] as ExpressionNode[],
			} satisfies ArrayExpressionNode)
		case 'ArrayElementsOpt -> ε':
			return () => []
		case 'ArrayElements -> ArrayElements Comma Expression':
			return values => [...(values[0] as ExpressionNode[]), ensureExpression(values[2], 'array element')]
		case 'ArrayElements -> Expression':
			return values => [ensureExpression(values[0], 'array element')]

		default:
			return null
	}
}

function createVariableDeclaration(
	kind: 'var' | 'const',
	name: string,
	initializer: ExpressionNode | null,
): VariableDeclarationNode {
	return {
		type: 'VariableDeclaration',
		kind,
		name,
		initializer,
	}
}

function createBinary(
	operator: BinaryExpressionNode['operator'],
	left: SemanticValue,
	right: SemanticValue,
): BinaryExpressionNode {
	return {
		type: 'BinaryExpression',
		operator,
		left: ensureExpression(left, `left operand for ${operator}`),
		right: ensureExpression(right, `right operand for ${operator}`),
	}
}

function createUnary(
	operator: UnaryExpressionNode['operator'],
	argument: SemanticValue,
): UnaryExpressionNode {
	return {
		type: 'UnaryExpression',
		operator,
		argument: ensureExpression(argument, `argument for ${operator}`),
	}
}

function ensureExpression(value: SemanticValue, context: string): ExpressionNode {
	if (value !== null && typeof value === 'object' && 'type' in value) {
		if (value.type === 'PendingAssignment') {
			throw new Error(`Присваивание недопустимо в контексте: ${context}`)
		}
		if (isExpressionNodeType(value.type)) {
			return value as ExpressionNode
		}
	}
	throw new Error(`Ожидалось выражение в контексте: ${context}`)
}

function expressionToAssignmentTarget(expression: ExpressionNode): AssignmentTargetNode {
	if (expression.type === 'IdentifierExpression') {
		return {
			type: 'IdentifierTarget',
			name: expression.name,
		} satisfies IdentifierTargetNode
	}
	if (expression.type === 'IndexExpression') {
		return {
			type: 'IndexTarget',
			object: expression.object,
			index: expression.index,
		} satisfies IndexTargetNode
	}
	throw new Error(`Недопустимая цель присваивания: ${expression.type}`)
}

function tokenLexeme(value: SemanticValue): string {
	if (value !== null && typeof value === 'object' && 'lexeme' in value) {
		return (value as unknown as Token).lexeme
	}
	throw new Error('Ожидался токен с lexeme')
}

function unquoteString(raw: string): string {
	return raw.slice(1, raw.length - 1)
}

function isPendingAssignment(value: SemanticValue): value is PendingAssignmentNode {
	return value !== null
		&& typeof value === 'object'
		&& 'type' in value
		&& value.type === 'PendingAssignment'
}

function isExpressionNodeType(type: string): boolean {
	return type === 'LiteralExpression'
		|| type === 'IdentifierExpression'
		|| type === 'UnaryExpression'
		|| type === 'BinaryExpression'
		|| type === 'ArrayExpression'
		|| type === 'IndexExpression'
		|| type === 'CallExpression'
}

function productionKey(production: Production): string {
	return `${production.lhs} -> ${production.rhs.length === 0
		? 'ε'
		: production.rhs.join(' ')}`
}

export {
	createSemanticActions,
}
