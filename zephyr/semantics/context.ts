import {
	type ClassDeclarationNode,
	type ClassMemberVisibility,
	type ConstructorDeclarationNode,
	type ForRangeStatementNode,
	type FunctionDeclarationNode,
	type IdentifierExpressionNode,
	type IdentifierTargetNode,
	type LambdaExpressionNode,
	type MethodDeclarationNode,
	type ProgramNode,
	type ReturnStatementNode,
	type StatementNode,
	type TypeAliasDeclarationNode,
	type VariableDeclarationNode,
	type WhileStatementNode,
} from '../ast'
import {match} from '../utils'
import {type SemanticType} from './SemanticType'

interface SemanticScope {
	bindings: Set<string>,
}

interface VariableSemanticBinding {
	kind: 'variable',
	declaration: VariableDeclarationNode,
}

interface FunctionSemanticBinding {
	kind: 'function',
	declaration: FunctionDeclarationNode,
}

interface ClassSemanticBinding {
	kind: 'class',
	declaration: ClassDeclarationNode,
}

interface NarrowedSemanticBinding {
	kind: 'narrowed',
	original: SemanticBinding,
	name: string,
	type: SemanticType,
}

interface ParameterSemanticBinding {
	kind: 'parameter',
	callableDeclaration: CallableDeclarationNode,
	index: number,
	name: string,
	type: SemanticType,
}

interface SuperSemanticBinding {
	kind: 'super',
	callableDeclaration: MethodDeclarationNode | ConstructorDeclarationNode,
	baseClassBinding: ClassSemanticBinding,
	selfBinding: ParameterSemanticBinding,
}

interface IteratorSemanticBinding {
	kind: 'iterator',
	statement: ForRangeStatementNode,
	name: string,
}

interface BuiltinSemanticBinding {
	kind: 'builtin',
	name: string,
}

type SemanticBinding =
	| VariableSemanticBinding
	| FunctionSemanticBinding
	| ClassSemanticBinding
	| NarrowedSemanticBinding
	| ParameterSemanticBinding
	| SuperSemanticBinding
	| IteratorSemanticBinding
	| BuiltinSemanticBinding

type OwnedSemanticBinding = Exclude<SemanticBinding, BuiltinSemanticBinding>
type CallableDeclarationNode =
	| FunctionDeclarationNode
	| MethodDeclarationNode
	| ConstructorDeclarationNode
	| LambdaExpressionNode
type SemanticFunctionOwner = ProgramNode | CallableDeclarationNode
type SemanticLoopOwner = WhileStatementNode | ForRangeStatementNode

interface SemanticModel {
	identifierBindings: WeakMap<IdentifierExpressionNode, SemanticBinding>,
	assignmentTargetBindings: WeakMap<IdentifierTargetNode, SemanticBinding>,
	statementLoopOwners: WeakMap<StatementNode, SemanticLoopOwner | null>,
	declarationBindings: WeakMap<
		VariableDeclarationNode | TypeAliasDeclarationNode | FunctionDeclarationNode | ClassDeclarationNode,
		SemanticBinding
	>,
	functionParameterBindings: WeakMap<CallableDeclarationNode, SemanticBinding[]>,
	forRangeBindings: WeakMap<ForRangeStatementNode, SemanticBinding>,
	returnOwners: WeakMap<ReturnStatementNode, CallableDeclarationNode | null>,
	bindingFunctionOwners: WeakMap<OwnedSemanticBinding, SemanticFunctionOwner>,
	callableCaptures: WeakMap<CallableDeclarationNode, SemanticBinding[]>,
	methodReceiverBindings: WeakMap<MethodDeclarationNode | ConstructorDeclarationNode, ClassSemanticBinding>,
	classFieldTypes: Map<string, Map<string, SemanticType>>,
	classFieldVisibilities: Map<string, Map<string, ClassMemberVisibility>>,
	classConstructorParameterTypes: Map<string, SemanticType[]>,
	classBaseNames: Map<string, string | null>,
	classMethodReturnTypes: Map<string, Map<string, SemanticType>>,
	classMethodParameterTypes: Map<string, Map<string, SemanticType[]>>,
	classMethodVisibilities: Map<string, Map<string, ClassMemberVisibility>>,
	classBaseBindings: WeakMap<ClassDeclarationNode, ClassSemanticBinding | null>,
	classDiscriminantValues: Map<string, Map<string, string | number | boolean | null>>,
	typeAliases: Map<string, SemanticType>,
}

function getBindingName(binding: SemanticBinding): string {
	return match(binding, 'kind', {
		variable: value => value.declaration.name,
		function: value => value.declaration.name,
		class: value => value.declaration.name,
		narrowed: value => value.name,
		parameter: value => value.name,
		iterator: value => value.name,
		super: 'super',
		builtin: value => value.name,
	})
}

function isBindingMutable(binding: SemanticBinding): boolean {
	return match(binding, 'kind', {
		variable: value => value.declaration.kind === 'var',
		narrowed: value => isBindingMutable(value.original),
		parameter: true,
		iterator: true,
		super: false,
		function: false,
		class: false,
		builtin: false,
	})
}

export {
	type BuiltinSemanticBinding,
	type CallableDeclarationNode,
	type ClassSemanticBinding,
	type FunctionSemanticBinding,
	getBindingName,
	isBindingMutable,
	type IteratorSemanticBinding,
	type NarrowedSemanticBinding,
	type OwnedSemanticBinding,
	type ParameterSemanticBinding,
	type SemanticBinding,
	type SemanticFunctionOwner,
	type SemanticLoopOwner,
	type SemanticModel,
	type SuperSemanticBinding,
	type SemanticScope,
	type VariableSemanticBinding,
}
