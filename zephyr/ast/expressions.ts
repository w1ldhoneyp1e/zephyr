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

interface IndexTargetNode {
	type: 'IndexTarget',
	object: ExpressionNode,
	index: ExpressionNode,
}

interface CallExpressionNode {
	type: 'CallExpression',
	callee: ExpressionNode,
	args: ExpressionNode[],
}

type AssignmentTargetNode = IdentifierTargetNode | IndexTargetNode

type ExpressionNode =
	| LiteralExpressionNode
	| IdentifierExpressionNode
	| UnaryExpressionNode
	| BinaryExpressionNode
	| ArrayExpressionNode
	| IndexExpressionNode
	| OptionalIndexExpressionNode
	| CallExpressionNode

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
	type LiteralExpressionNode,
	type OptionalIndexExpressionNode,
	type UnaryExpressionNode,
}
