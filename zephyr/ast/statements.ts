import {type FunctionDeclarationNode, type VariableDeclarationNode} from './declarations'
import {type AssignmentTargetNode, type ExpressionNode} from './expressions'

interface BlockStatementNode {
	type: 'BlockStatement',
	statements: StatementNode[],
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

export {
	type AssignmentStatementNode,
	type BlockStatementNode,
	type ExpressionStatementNode,
	type ForRangeStatementNode,
	type IfStatementNode,
	type ReturnStatementNode,
	type StatementNode,
	type WhileStatementNode,
}
