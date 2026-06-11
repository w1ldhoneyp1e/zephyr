import {type ExpressionNode} from './expressions'
import {type BlockStatementNode, type StatementNode} from './statements'

type TypeName = string | TypeNameNode
type ClassMemberVisibility = 'public' | 'private'

interface TypeNameNode {
	type: 'TypeName',
	source: string,
	objectMembers?: ObjectTypeMemberNode[],
}

interface ObjectTypeMemberNode {
	type: 'ObjectTypeMember',
	name: string,
	typeName: TypeName,
	source: string,
}

interface ParameterNode {
	type: 'Parameter',
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

function typeNameToString(typeName: TypeName): string {
	return typeof typeName === 'string'
		? typeName
		: typeName.source
}

export {
	type ClassMemberVisibility,
	type ClassFieldNode,
	type ClassDeclarationNode,
	type ConstructorDeclarationNode,
	type FunctionDeclarationNode,
	type MethodDeclarationNode,
	type ObjectTypeMemberNode,
	type ParameterNode,
	type ProgramNode,
	type TypeAliasDeclarationNode,
	type TypeNameNode,
	type TypeName,
	type VariableDeclarationNode,
	typeNameToString,
}
