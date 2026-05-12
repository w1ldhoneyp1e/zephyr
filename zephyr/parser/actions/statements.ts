import {type Production} from '../grammar'
import {
	type AssignmentStatementNode,
	type BlockStatementNode,
	type BreakStatementNode,
	type ContinueStatementNode,
	type ExpressionNode,
	type ExpressionStatementNode,
	type ForRangeStatementNode,
	type IfStatementNode,
	type ReturnStatementNode,
	type SemanticValueAction,
	type StatementNode,
	type WhileStatementNode,
	ensureExpression,
	expressionToAssignmentTarget,
	isPendingAssignment,
	productionKey,
	tokenLexeme,
} from './context'

function createStatementAction(production: Production): SemanticValueAction | null {
	switch (productionKey(production)) {
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
		case 'BreakStatement -> Break Semicolon':
			return () => ({
				type: 'BreakStatement',
			} satisfies BreakStatementNode)
		case 'ContinueStatement -> Continue Semicolon':
			return () => ({
				type: 'ContinueStatement',
			} satisfies ContinueStatementNode)
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

		default:
			return null
	}
}

export {
	createStatementAction,
}
