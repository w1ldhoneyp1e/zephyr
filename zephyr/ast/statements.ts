import {
	type ClassDeclarationNode,
	type FunctionDeclarationNode,
	type VariableDeclarationNode,
} from './declarations'
import {type AssignmentTargetNode, type ExpressionNode} from './expressions'

type ExportableStatementNode =
	| VariableDeclarationNode
	| FunctionDeclarationNode
	| ClassDeclarationNode

interface ImportStatementNode {
	type: 'ImportStatement',
	names: string[],
	source: string,
}

interface ExportStatementNode {
	type: 'ExportStatement',
	statement: ExportableStatementNode,
}

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

interface BreakStatementNode {
	type: 'BreakStatement',
}

interface ContinueStatementNode {
	type: 'ContinueStatement',
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
	| ClassDeclarationNode
	| ImportStatementNode
	| ExportStatementNode
	| IfStatementNode
	| WhileStatementNode
	| ForRangeStatementNode
	| ReturnStatementNode
	| BreakStatementNode
	| ContinueStatementNode
	| ExpressionStatementNode
	| AssignmentStatementNode

export {
	type AssignmentStatementNode,
	type BlockStatementNode,
	type BreakStatementNode,
	type ContinueStatementNode,
	type ExportableStatementNode,
	type ExportStatementNode,
	type ExpressionStatementNode,
	type ForRangeStatementNode,
	type ImportStatementNode,
	type IfStatementNode,
	type ReturnStatementNode,
	type StatementNode,
	type WhileStatementNode,
}
