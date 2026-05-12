import {type Production} from '../grammar'
import {
	type ArrayExpressionNode,
	type CallExpressionNode,
	type ExpressionNode,
	type IdentifierExpressionNode,
	type IndexExpressionNode,
	type LiteralExpressionNode,
	type PendingAssignmentNode,
	type SemanticValueAction,
	createBinary,
	createUnary,
	ensureExpression,
	productionKey,
	tokenLexeme,
	unquoteString,
} from './context'

function createExpressionAction(production: Production): SemanticValueAction | null {
	switch (productionKey(production)) {
		case 'Expression -> AssignmentExpression':
		case 'AssignmentExpression -> CoalesceExpression':
		case 'CoalesceExpression -> OrExpression':
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

		case 'CoalesceExpression -> CoalesceExpression QuestionQuestion OrExpression':
			return values => createBinary('??', values[0], values[2])
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
		case 'PrimaryExpression -> Null':
			return () => ({
				type: 'LiteralExpression',
				value: null,
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

export {
	createExpressionAction,
}
