import {type ParameterNode} from './declarations'
import {type BlockStatementNode} from './statements'

interface IdentifierTargetNode {
	type: 'IdentifierTarget',
	name: string,
}

interface LiteralExpressionNode {
	type: 'LiteralExpression',
	value: number | string | boolean | null,
}

interface IdentifierExpressionNode {
	type: 'IdentifierExpression',
	name: string, // TODO: Ограничить правила типизацией
}

interface UnaryExpressionNode {
	type: 'UnaryExpression',
	operator: '-' | '!',
	argument: ExpressionNode,
}

interface BinaryExpressionNode {
	type: 'BinaryExpression',
	operator: '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||' | '??',
	left: ExpressionNode,
	right: ExpressionNode,
}

interface ArrayExpressionNode {
	type: 'ArrayExpression',
	elements: ExpressionNode[],
}

interface ObjectExpressionPropertyNode {
	type: 'ObjectExpressionProperty',
	name: string,
	value: ExpressionNode,
}

interface ObjectExpressionNode {
	type: 'ObjectExpression',
	properties: ObjectExpressionPropertyNode[],
}

interface ConditionalBranchNode {
	condition: ExpressionNode,
	value: ExpressionNode,
}

interface MatchValueBranchNode {
	pattern: ExpressionNode,
	value: ExpressionNode,
}

interface MatchByPatternNode {
	type: 'MatchByPattern',
	value: string | number | boolean | null,
}

interface MatchByBranchNode {
	pattern: MatchByPatternNode,
	value: ExpressionNode,
}

interface IndexExpressionNode {
	type: 'IndexExpression',
	object: ExpressionNode,
	index: ExpressionNode,
}

interface OptionalIndexExpressionNode {
	type: 'OptionalIndexExpression',
	object: ExpressionNode,
	index: ExpressionNode,
}

interface MemberExpressionNode {
	type: 'MemberExpression',
	object: ExpressionNode,
	property: string,
}

interface OptionalMemberExpressionNode {
	type: 'OptionalMemberExpression',
	object: ExpressionNode,
	property: string,
}

interface IndexTargetNode {
	type: 'IndexTarget',
	object: ExpressionNode,
	index: ExpressionNode,
}

interface MemberTargetNode {
	type: 'MemberTarget',
	object: ExpressionNode,
	property: string,
}

interface CallExpressionNode {
	type: 'CallExpression',
	callee: ExpressionNode,
	args: ExpressionNode[],
}

interface LambdaExpressionNode {
	type: 'LambdaExpression',
	params: ParameterNode[],
	body: ExpressionNode | BlockStatementNode,
}

interface ChooseExpressionNode {
	type: 'ChooseExpression',
	branches: ConditionalBranchNode[],
	defaultValue: ExpressionNode,
}

interface CollectExpressionNode {
	type: 'CollectExpression',
	branches: ConditionalBranchNode[],
}

interface MatchExpressionNode {
	type: 'MatchExpression',
	subject: ExpressionNode,
	branches: MatchValueBranchNode[],
	defaultValue: ExpressionNode | null,
}

interface MatchByExpressionNode {
	type: 'MatchByExpression',
	subject: ExpressionNode,
	discriminant: string,
	branches: MatchByBranchNode[],
	defaultValue: ExpressionNode | null,
}

type AssignmentTargetNode = IdentifierTargetNode | IndexTargetNode | MemberTargetNode

type ExpressionNode =
	| LiteralExpressionNode
	| IdentifierExpressionNode
	| UnaryExpressionNode
	| BinaryExpressionNode
	| ArrayExpressionNode
	| ObjectExpressionNode
	| IndexExpressionNode
	| OptionalIndexExpressionNode
	| MemberExpressionNode
	| OptionalMemberExpressionNode
	| CallExpressionNode
	| LambdaExpressionNode
	| ChooseExpressionNode
	| CollectExpressionNode
	| MatchExpressionNode
	| MatchByExpressionNode

export {
	type ArrayExpressionNode,
	type AssignmentTargetNode,
	type BinaryExpressionNode,
	type CallExpressionNode,
	type ChooseExpressionNode,
	type CollectExpressionNode,
	type ConditionalBranchNode,
	type ExpressionNode,
	type IdentifierExpressionNode,
	type IdentifierTargetNode,
	type IndexExpressionNode,
	type IndexTargetNode,
	type LambdaExpressionNode,
	type LiteralExpressionNode,
	type MatchByBranchNode,
	type MatchByExpressionNode,
	type MatchByPatternNode,
	type MatchExpressionNode,
	type MatchValueBranchNode,
	type MemberExpressionNode,
	type MemberTargetNode,
	type ObjectExpressionNode,
	type ObjectExpressionPropertyNode,
	type OptionalIndexExpressionNode,
	type OptionalMemberExpressionNode,
	type UnaryExpressionNode,
}
