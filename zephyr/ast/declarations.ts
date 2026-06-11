import {type ExpressionNode} from './expressions'
import {type BlockStatementNode, type StatementNode} from './statements'

type TypeName = string
type ClassMemberVisibility = 'public' | 'private'

interface ParameterNode {
	name: string,
	typeName: TypeName,
}

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

interface TypeAliasDeclarationNode {
	type: 'TypeAliasDeclaration',
	name: string,
	typeName: TypeName,
}

interface ClassFieldNode {
	type: 'ClassField',
	name: string,
	typeName: TypeName,
	visibility: ClassMemberVisibility,
}

interface FunctionDeclarationNode {
	type: 'FunctionDeclaration',
	name: string,
	typeParams: string[],
	params: ParameterNode[],
	returnTypeName: TypeName,
	body: BlockStatementNode,
}

interface MethodDeclarationNode {
	type: 'MethodDeclaration',
	name: string,
	visibility: ClassMemberVisibility,
	params: ParameterNode[],
	returnTypeName: TypeName,
	body: BlockStatementNode,
}

interface ConstructorDeclarationNode {
	type: 'ConstructorDeclaration',
	params: ParameterNode[],
	body: BlockStatementNode,
}

interface ClassDeclarationNode {
	type: 'ClassDeclaration',
	name: string,
	baseClassName: string | null,
	fields: ClassFieldNode[],
	constructorDeclaration: ConstructorDeclarationNode | null,
	methods: MethodDeclarationNode[],
}

export {
	type ClassMemberVisibility,
	type ClassFieldNode,
	type ClassDeclarationNode,
	type ConstructorDeclarationNode,
	type FunctionDeclarationNode,
	type MethodDeclarationNode,
	type ParameterNode,
	type ProgramNode,
	type TypeAliasDeclarationNode,
	type TypeName,
	type VariableDeclarationNode,
}
