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

type AssignmentTargetNode = IdentifierTargetNode | IndexTargetNode | MemberTargetNode

type ExpressionNode =
	| LiteralExpressionNode
	| IdentifierExpressionNode
	| UnaryExpressionNode
	| BinaryExpressionNode
	| ArrayExpressionNode
	| IndexExpressionNode
	| OptionalIndexExpressionNode
	| MemberExpressionNode
	| OptionalMemberExpressionNode
	| CallExpressionNode
	| LambdaExpressionNode

export {
	type ArrayExpressionNode,
	type AssignmentTargetNode,
	type BinaryExpressionNode,
	type CallExpressionNode,
	type ExpressionNode,
	type IdentifierExpressionNode,
	type IdentifierTargetNode,
	type IndexExpressionNode,
	type IndexTargetNode,
	type LambdaExpressionNode,
	type LiteralExpressionNode,
	type MemberExpressionNode,
	type MemberTargetNode,
	type OptionalIndexExpressionNode,
	type OptionalMemberExpressionNode,
	type UnaryExpressionNode,
}
