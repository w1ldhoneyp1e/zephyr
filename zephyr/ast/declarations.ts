import {type ExpressionNode} from './expressions'
import {type BlockStatementNode, type StatementNode} from './statements'

interface ProgramNode {
	type: 'Program',
	body: StatementNode[],
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

interface MethodDeclarationNode {
	type: 'MethodDeclaration',
	name: string,
	params: string[],
	body: BlockStatementNode,
}

interface StructDeclarationNode {
	type: 'StructDeclaration',
	name: string,
	fields: string[],
	methods: MethodDeclarationNode[],
}

export {
	type FunctionDeclarationNode,
	type MethodDeclarationNode,
	type ProgramNode,
	type StructDeclarationNode,
	type VariableDeclarationNode,
}
