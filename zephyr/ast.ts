interface ProgramNode {
	type: 'Program',
	body: StatementNode[],
}

interface BlockStatementNode {
	type: 'BlockStatement',
	statements: StatementNode[],
}

interface VariableDeclarationNode {
	type: 'VariableDeclaration',
	kind: 'var' | 'const',
	name: string, // TODO: Ограничить правила типизацией
	initializer: ExpressionNode | null,
}

interface FunctionDeclarationNode {
	type: 'FunctionDeclaration',
	name: string,
	params: string[],
	body: BlockStatementNode,
}

interface IfStatementNode {
	type: 'IfStatement',
	condition: ExpressionNode,
	thenBranch: BlockStatementNode,
	elseBranch: BlockStatementNode | null,
}

interface WhileStatementNode {
	type: 'WhileStatement',
	condition: ExpressionNode,
	body: BlockStatementNode,
}

interface ForRangeStatementNode {
	type: 'ForRangeStatement',
	iterator: string,
	start: ExpressionNode,
	end: ExpressionNode,
	body: BlockStatementNode,
}

interface ReturnStatementNode {
	type: 'ReturnStatement',
	value: ExpressionNode | null,
}

interface ExpressionStatementNode {
	type: 'ExpressionStatement',
	expression: ExpressionNode,
}

interface AssignmentStatementNode {
	type: 'AssignmentStatement',
	target: AssignmentTargetNode,
	value: ExpressionNode,
}

type StatementNode =
	| BlockStatementNode
	| VariableDeclarationNode
	| FunctionDeclarationNode
	| IfStatementNode
	| WhileStatementNode
	| ForRangeStatementNode
	| ReturnStatementNode
	| ExpressionStatementNode
	| AssignmentStatementNode

interface IdentifierTargetNode {
	type: 'IdentifierTarget',
	name: string,
}

interface IndexTargetNode {
	type: 'IndexTarget',
	object: ExpressionNode,
	index: ExpressionNode,
}

type AssignmentTargetNode = IdentifierTargetNode | IndexTargetNode

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
	operator: '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||',
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

interface CallExpressionNode {
	type: 'CallExpression',
	callee: ExpressionNode,
	args: ExpressionNode[],
}

type ExpressionNode =
	| LiteralExpressionNode
	| IdentifierExpressionNode
	| UnaryExpressionNode
	| BinaryExpressionNode
	| ArrayExpressionNode
	| IndexExpressionNode
	| CallExpressionNode

export {
	ProgramNode,
	StatementNode,
	BlockStatementNode,
	VariableDeclarationNode,
	FunctionDeclarationNode,
	IfStatementNode,
	WhileStatementNode,
	ForRangeStatementNode,
	ReturnStatementNode,
	ExpressionStatementNode,
	AssignmentStatementNode,
	AssignmentTargetNode,
	IdentifierTargetNode,
	IndexTargetNode,
	ExpressionNode,
	LiteralExpressionNode,
	IdentifierExpressionNode,
	UnaryExpressionNode,
	BinaryExpressionNode,
	ArrayExpressionNode,
	IndexExpressionNode,
	CallExpressionNode,
}
