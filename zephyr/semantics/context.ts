import {
	type ClassDeclarationNode,
	type ClassMemberVisibility,
	type ForRangeStatementNode,
	type FunctionDeclarationNode,
	type IdentifierExpressionNode,
	type IdentifierTargetNode,
	type LambdaExpressionNode,
	type MethodDeclarationNode,
	type ProgramNode,
	type ReturnStatementNode,
	type StatementNode,
	type VariableDeclarationNode,
	type WhileStatementNode,
} from '../ast'

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

interface ParameterSemanticBinding {
	kind: 'parameter',
	callableDeclaration: CallableDeclarationNode,
	index: number,
	name: string,
	typeName: string,
}

interface SuperSemanticBinding {
	kind: 'super',
	callableDeclaration: MethodDeclarationNode,
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
	| ParameterSemanticBinding
	| SuperSemanticBinding
	| IteratorSemanticBinding
	| BuiltinSemanticBinding

type OwnedSemanticBinding = Exclude<SemanticBinding, BuiltinSemanticBinding>
type CallableDeclarationNode = FunctionDeclarationNode | MethodDeclarationNode | LambdaExpressionNode
type SemanticFunctionOwner = ProgramNode | CallableDeclarationNode
type SemanticLoopOwner = WhileStatementNode | ForRangeStatementNode

interface SemanticModel {
	identifierBindings: WeakMap<IdentifierExpressionNode, SemanticBinding>,
	assignmentTargetBindings: WeakMap<IdentifierTargetNode, SemanticBinding>,
	statementLoopOwners: WeakMap<StatementNode, SemanticLoopOwner | null>,
	declarationBindings: WeakMap<
		VariableDeclarationNode | FunctionDeclarationNode | ClassDeclarationNode,
		SemanticBinding
	>,
	functionParameterBindings: WeakMap<CallableDeclarationNode, SemanticBinding[]>,
	forRangeBindings: WeakMap<ForRangeStatementNode, SemanticBinding>,
	returnOwners: WeakMap<ReturnStatementNode, CallableDeclarationNode | null>,
	bindingFunctionOwners: WeakMap<OwnedSemanticBinding, SemanticFunctionOwner>,
	callableCaptures: WeakMap<CallableDeclarationNode, SemanticBinding[]>,
	methodReceiverBindings: WeakMap<MethodDeclarationNode, ClassSemanticBinding>,
	classFieldTypes: Map<string, Map<string, string>>,
	classFieldVisibilities: Map<string, Map<string, ClassMemberVisibility>>,
	classConstructorParameterTypes: Map<string, string[]>,
	classBaseNames: Map<string, string | null>,
	classMethodReturnTypes: Map<string, Map<string, string>>,
	classMethodParameterTypes: Map<string, Map<string, string[]>>,
	classMethodVisibilities: Map<string, Map<string, ClassMemberVisibility>>,
	classBaseBindings: WeakMap<ClassDeclarationNode, ClassSemanticBinding | null>,
}

function getBindingName(binding: SemanticBinding): string {
	switch (binding.kind) {
		case 'variable':
		case 'function':
		case 'class':
			return binding.declaration.name
		case 'parameter':
		case 'iterator':
		case 'super':
		case 'builtin':
			return binding.kind === 'super'
				? 'super'
				: binding.name
	}
}

function isBindingMutable(binding: SemanticBinding): boolean {
	switch (binding.kind) {
		case 'variable':
			return binding.declaration.kind === 'var'
		case 'parameter':
		case 'iterator':
			return true
		case 'super':
			return false
		case 'function':
		case 'class':
		case 'builtin':
			return false
	}
}

export {
	type BuiltinSemanticBinding,
	type CallableDeclarationNode,
	type ClassSemanticBinding,
	type FunctionSemanticBinding,
	getBindingName,
	isBindingMutable,
	type IteratorSemanticBinding,
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
