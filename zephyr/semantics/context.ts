import {
	type FunctionDeclarationNode,
	type IdentifierExpressionNode,
	type IdentifierTargetNode,
	type VariableDeclarationNode,
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

interface ParameterSemanticBinding {
	kind: 'parameter',
	functionDeclaration: FunctionDeclarationNode,
	name: string,
}

interface BuiltinSemanticBinding {
	kind: 'builtin',
	name: string,
}

type SemanticBinding =
	| VariableSemanticBinding
	| FunctionSemanticBinding
	| ParameterSemanticBinding
	| BuiltinSemanticBinding

interface SemanticModel {
	identifierBindings: WeakMap<IdentifierExpressionNode, SemanticBinding>,
	assignmentTargetBindings: WeakMap<IdentifierTargetNode, SemanticBinding>,
}

export {
	type BuiltinSemanticBinding,
	type FunctionSemanticBinding,
	type ParameterSemanticBinding,
	type SemanticBinding,
	type SemanticModel,
	type SemanticScope,
	type VariableSemanticBinding,
}
