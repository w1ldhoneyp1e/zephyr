import {
	type ClassDeclarationNode,
	type FunctionDeclarationNode,
	type TypeAliasDeclarationNode,
	type VariableDeclarationNode,
} from './declarations'
import {type AssignmentTargetNode, type ExpressionNode} from './expressions'

type ExportableStatementNode =
	| VariableDeclarationNode
	| TypeAliasDeclarationNode
	| FunctionDeclarationNode
	| ClassDeclarationNode

interface ImportStatementNode {
	type: 'ImportStatement',
	names: ImportNameNode[],
	source: string,
}

interface ImportNameNode {
	type: 'ImportName',
	name: string,
}

interface ExportStatementNode {
	type: 'ExportStatement',
	statement: ExportableStatementNode,
}

interface NamedExportStatementNode {
	type: 'NamedExportStatement',
	names: ImportNameNode[],
	source: string | null,
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

interface ForStatementNode {
	type: 'ForStatement',
	iterator: string,
	start: ExpressionNode,
	condition: ExpressionNode,
	incrementTarget: string,
	increment: ExpressionNode,
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
	| TypeAliasDeclarationNode
	| FunctionDeclarationNode
	| ClassDeclarationNode
	| ImportStatementNode
	| ExportStatementNode
	| NamedExportStatementNode
	| IfStatementNode
	| WhileStatementNode
	| ForRangeStatementNode
	| ForStatementNode
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
	type ImportNameNode,
	type NamedExportStatementNode,
	type ExportStatementNode,
	type ExpressionStatementNode,
	type ForStatementNode,
	type ForRangeStatementNode,
	type ImportStatementNode,
	type IfStatementNode,
	type ReturnStatementNode,
	type StatementNode,
	type TypeAliasDeclarationNode,
	type WhileStatementNode,
}
