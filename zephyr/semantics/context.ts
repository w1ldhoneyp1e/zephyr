import {
	type ClassDeclarationNode,
	type ForRangeStatementNode,
	type FunctionDeclarationNode,
	type IdentifierExpressionNode,
	type IdentifierTargetNode,
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
	| IteratorSemanticBinding
	| BuiltinSemanticBinding

type OwnedSemanticBinding = Exclude<SemanticBinding, BuiltinSemanticBinding>
type CallableDeclarationNode = FunctionDeclarationNode | MethodDeclarationNode
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
	classConstructorParameterTypes: Map<string, string[]>,
	classMethodReturnTypes: Map<string, Map<string, string>>,
	classMethodParameterTypes: Map<string, Map<string, string[]>>,
}

function getBindingName(binding: SemanticBinding): string {
	switch (binding.kind) {
		case 'variable':
		case 'function':
		case 'class':
			return binding.declaration.name
		case 'parameter':
		case 'iterator':
		case 'builtin':
			return binding.name
	}
}

function isBindingMutable(binding: SemanticBinding): boolean {
	switch (binding.kind) {
		case 'variable':
			return binding.declaration.kind === 'var'
		case 'parameter':
		case 'iterator':
			return true
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
	type SemanticScope,
	type VariableSemanticBinding,
}
