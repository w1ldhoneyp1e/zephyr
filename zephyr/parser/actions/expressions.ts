import {type Production} from '../grammar'
import {
	type ArrayExpressionNode,
	type BlockStatementNode,
	type CallExpressionNode,
	type ChooseBranchesValue,
	type ChooseExpressionNode,
	type CollectExpressionNode,
	type ConditionalBranchNode,
	type ExpressionNode,
	type IdentifierExpressionNode,
	type IndexExpressionNode,
	type LambdaExpressionNode,
	type LiteralExpressionNode,
	type MatchByBranchesValue,
	type MatchByBranchNode,
	type MatchByExpressionNode,
	type MatchByPatternNode,
	type MatchExpressionNode,
	type MatchValueBranchesValue,
	type MatchValueBranchNode,
	type MemberExpressionNode,
	type OptionalIndexExpressionNode,
	type OptionalMemberExpressionNode,
	type ParameterNode,
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
		case 'Expression -> LambdaExpression':
		case 'Expression -> PipelineExpression':
		case 'PipelineExpression -> AssignmentExpression':
		case 'PipelineStage -> LambdaExpression':
		case 'PipelineStage -> PostfixExpression':
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
		case 'ArgumentListOpt -> ArgumentList ArgumentTrailingCommaOpt':
		case 'ArrayElementsOpt -> ArrayElements ArrayTrailingCommaOpt':
			return values => values[0]

		case 'PipelineExpression -> PipelineExpression ThinArrow PipelineStage':
			return values => createPipelineCall(values[0], values[2])
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
		case 'PostfixExpression -> PostfixExpression QuestionLeftBracket Expression RightBracket':
			return values => ({
				type: 'OptionalIndexExpression',
				object: ensureExpression(values[0], 'optional index object'),
				index: ensureExpression(values[2], 'optional index expression'),
			} satisfies OptionalIndexExpressionNode)
		case 'PostfixExpression -> PostfixExpression Dot Identifier':
			return values => ({
				type: 'MemberExpression',
				object: ensureExpression(values[0], 'member object'),
				property: tokenLexeme(values[2]),
			} satisfies MemberExpressionNode)
		case 'PostfixExpression -> PostfixExpression QuestionDot Identifier':
			return values => ({
				type: 'OptionalMemberExpression',
				object: ensureExpression(values[0], 'optional member object'),
				property: tokenLexeme(values[2]),
			} satisfies OptionalMemberExpressionNode)
		case 'ArgumentListOpt -> ε':
			return () => []
		case 'ArgumentTrailingCommaOpt -> Comma':
		case 'ArgumentTrailingCommaOpt -> ε':
			return () => null
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
		case 'PrimaryExpression -> Super':
			return values => ({
				type: 'IdentifierExpression',
				name: tokenLexeme(values[0]),
			} satisfies IdentifierExpressionNode)
		case 'LambdaExpression -> LeftParen ParameterListOpt RightParen Arrow LambdaBody':
			return values => ({
				type: 'LambdaExpression',
				params: values[1] as ParameterNode[],
				body: values[4] as ExpressionNode | BlockStatementNode,
			} satisfies LambdaExpressionNode)
		case 'LambdaBody -> BlockStatement':
		case 'LambdaBody -> Expression':
			return values => values[0]
		case 'PrimaryExpression -> LeftParen Expression RightParen':
			return values => ensureExpression(values[1], 'grouped expression')
		case 'PrimaryExpression -> LeftBracket ArrayElementsOpt RightBracket':
			return values => ({
				type: 'ArrayExpression',
				elements: values[1] as ExpressionNode[],
			} satisfies ArrayExpressionNode)
		case 'PrimaryExpression -> ChooseExpression':
		case 'PrimaryExpression -> CollectExpression':
		case 'PrimaryExpression -> MatchExpression':
			return values => values[0]
		case 'ChooseExpression -> Choose LeftBrace ChooseBranches RightBrace':
			return values => {
				const chooseBranches = values[2] as ChooseBranchesValue

				return {
					type: 'ChooseExpression',
					branches: chooseBranches.branches,
					defaultValue: chooseBranches.defaultValue,
				} satisfies ChooseExpressionNode
			}
		case 'ChooseBranches -> ChooseBranchList Comma ChooseDefaultBranch ChooseTrailingCommaOpt':
			return values => ({
				branches: values[0] as ConditionalBranchNode[],
				defaultValue: ensureExpression(values[2], 'choose default value'),
			} satisfies ChooseBranchesValue)
		case 'ChooseBranches -> ChooseDefaultBranch ChooseTrailingCommaOpt':
			return values => ({
				branches: [],
				defaultValue: ensureExpression(values[0], 'choose default value'),
			} satisfies ChooseBranchesValue)
		case 'ChooseTrailingCommaOpt -> Comma':
		case 'ChooseTrailingCommaOpt -> ε':
			return () => null
		case 'ChooseBranchList -> ChooseBranchList Comma ChooseBranch':
			return values => [...(values[0] as ConditionalBranchNode[]), values[2] as ConditionalBranchNode]
		case 'ChooseBranchList -> ChooseBranch':
			return values => [values[0] as ConditionalBranchNode]
		case 'ChooseBranch -> AssignmentExpression Arrow Expression':
			return values => ({
				condition: ensureExpression(values[0], 'choose condition'),
				value: ensureExpression(values[2], 'choose branch value'),
			} satisfies ConditionalBranchNode)
		case 'ChooseDefaultBranch -> Underscore Arrow Expression':
			return values => ensureExpression(values[2], 'choose default value')
		case 'CollectExpression -> Collect LeftBrace CollectBranchListOpt RightBrace':
			return values => ({
				type: 'CollectExpression',
				branches: values[2] as ConditionalBranchNode[],
			} satisfies CollectExpressionNode)
		case 'CollectBranchListOpt -> CollectBranchList CollectTrailingCommaOpt':
			return values => values[0]
		case 'CollectBranchListOpt -> ε':
			return () => []
		case 'CollectTrailingCommaOpt -> Comma':
		case 'CollectTrailingCommaOpt -> ε':
			return () => null
		case 'CollectBranchList -> CollectBranchList Comma CollectBranch':
			return values => [...(values[0] as ConditionalBranchNode[]), values[2] as ConditionalBranchNode]
		case 'CollectBranchList -> CollectBranch':
			return values => [values[0] as ConditionalBranchNode]
		case 'CollectBranch -> AssignmentExpression Arrow Expression':
			return values => ({
				condition: ensureExpression(values[0], 'collect condition'),
				value: ensureExpression(values[2], 'collect branch value'),
			} satisfies ConditionalBranchNode)
		case 'MatchExpression -> Match Expression LeftBrace MatchValueBranches RightBrace':
			return values => {
				const matchBranches = values[3] as MatchValueBranchesValue

				return {
					type: 'MatchExpression',
					subject: ensureExpression(values[1], 'match subject'),
					branches: matchBranches.branches,
					defaultValue: matchBranches.defaultValue,
				} satisfies MatchExpressionNode
			}
		case 'MatchExpression -> Match Expression By Identifier LeftBrace MatchByBranches RightBrace':
			return values => {
				const matchBranches = values[5] as MatchByBranchesValue

				return {
					type: 'MatchByExpression',
					subject: ensureExpression(values[1], 'match subject'),
					discriminant: tokenLexeme(values[3]),
					branches: matchBranches.branches,
					defaultValue: matchBranches.defaultValue,
				} satisfies MatchByExpressionNode
			}
		case 'MatchTrailingCommaOpt -> Comma':
		case 'MatchTrailingCommaOpt -> ε':
			return () => null
		case 'MatchValueBranches -> MatchValueBranchList Comma MatchValueDefaultBranch MatchTrailingCommaOpt':
			return values => ({
				branches: values[0] as MatchValueBranchNode[],
				defaultValue: ensureExpression(values[2], 'match default value'),
			} satisfies MatchValueBranchesValue)
		case 'MatchValueBranches -> MatchValueDefaultBranch MatchTrailingCommaOpt':
			return values => ({
				branches: [],
				defaultValue: ensureExpression(values[0], 'match default value'),
			} satisfies MatchValueBranchesValue)
		case 'MatchValueBranchList -> MatchValueBranchList Comma MatchValueBranch':
			return values => [...(values[0] as MatchValueBranchNode[]), values[2] as MatchValueBranchNode]
		case 'MatchValueBranchList -> MatchValueBranch':
			return values => [values[0] as MatchValueBranchNode]
		case 'MatchValueBranch -> AssignmentExpression Arrow Expression':
			return values => ({
				pattern: ensureExpression(values[0], 'match pattern'),
				value: ensureExpression(values[2], 'match branch value'),
			} satisfies MatchValueBranchNode)
		case 'MatchValueDefaultBranch -> Underscore Arrow Expression':
			return values => ensureExpression(values[2], 'match default value')
		case 'MatchByBranches -> MatchByBranchList Comma MatchByDefaultBranch MatchTrailingCommaOpt':
			return values => ({
				branches: values[0] as MatchByBranchNode[],
				defaultValue: ensureExpression(values[2], 'match-by default value'),
			} satisfies MatchByBranchesValue)
		case 'MatchByBranches -> MatchByDefaultBranch MatchTrailingCommaOpt':
			return values => ({
				branches: [],
				defaultValue: ensureExpression(values[0], 'match-by default value'),
			} satisfies MatchByBranchesValue)
		case 'MatchByBranchList -> MatchByBranchList Comma MatchByBranch':
			return values => [...(values[0] as MatchByBranchNode[]), values[2] as MatchByBranchNode]
		case 'MatchByBranchList -> MatchByBranch':
			return values => [values[0] as MatchByBranchNode]
		case 'MatchByBranch -> MatchByPattern Arrow Expression':
			return values => ({
				pattern: values[0] as MatchByPatternNode,
				value: ensureExpression(values[2], 'match-by branch value'),
			} satisfies MatchByBranchNode)
		case 'MatchByPattern -> Identifier':
			return values => ({
				value: tokenLexeme(values[0]),
			} satisfies MatchByPatternNode)
		case 'MatchByPattern -> Number':
			return values => ({
				value: Number(tokenLexeme(values[0])),
			} satisfies MatchByPatternNode)
		case 'MatchByPattern -> String':
			return values => ({
				value: unquoteString(tokenLexeme(values[0])),
			} satisfies MatchByPatternNode)
		case 'MatchByPattern -> True':
			return () => ({
				value: true,
			} satisfies MatchByPatternNode)
		case 'MatchByPattern -> False':
			return () => ({
				value: false,
			} satisfies MatchByPatternNode)
		case 'MatchByPattern -> Null':
			return () => ({
				value: null,
			} satisfies MatchByPatternNode)
		case 'MatchByDefaultBranch -> Underscore Arrow Expression':
			return values => ensureExpression(values[2], 'match-by default value')
		case 'ArrayElementsOpt -> ε':
			return () => []
		case 'ArrayTrailingCommaOpt -> Comma':
		case 'ArrayTrailingCommaOpt -> ε':
			return () => null
		case 'ArrayElements -> ArrayElements Comma Expression':
			return values => [...(values[0] as ExpressionNode[]), ensureExpression(values[2], 'array element')]
		case 'ArrayElements -> Expression':
			return values => [ensureExpression(values[0], 'array element')]

		default:
			return null
	}
}

function createPipelineCall(left: unknown, stage: unknown): CallExpressionNode {
	const input = ensureExpression(left as ExpressionNode, 'pipeline input')
	const target = ensureExpression(stage as ExpressionNode, 'pipeline stage')

	if (target.type === 'CallExpression') {
		return {
			type: 'CallExpression',
			callee: target.callee,
			args: [input, ...target.args],
		}
	}

	return {
		type: 'CallExpression',
		callee: target,
		args: [input],
	}
}

export {
	createExpressionAction,
}
