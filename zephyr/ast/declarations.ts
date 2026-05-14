import {type ExpressionNode} from './expressions'
import {type BlockStatementNode, type StatementNode} from './statements'

type TypeName = string

interface ProgramNode {
	type: 'Program',
	body: StatementNode[],
}

interface VariableDeclarationNode {
	type: 'VariableDeclaration',
	kind: 'var' | 'const',
	name: string, // TODO: Ограничить правила типизацией
	typeName: TypeName,
	initializer: ExpressionNode | null,
}

interface ClassFieldNode {
	name: string,
	typeName: TypeName,
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

interface ClassDeclarationNode {
	type: 'ClassDeclaration',
	name: string,
	fields: ClassFieldNode[],
	methods: MethodDeclarationNode[],
}

export {
	type ClassFieldNode,
	type ClassDeclarationNode,
	type FunctionDeclarationNode,
	type MethodDeclarationNode,
	type ProgramNode,
	type TypeName,
	type VariableDeclarationNode,
}
