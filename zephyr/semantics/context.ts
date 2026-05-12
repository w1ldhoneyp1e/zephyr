import {
	type ForRangeStatementNode,
	type FunctionDeclarationNode,
	type IdentifierExpressionNode,
	type IdentifierTargetNode,
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

interface ParameterSemanticBinding {
	kind: 'parameter',
	functionDeclaration: FunctionDeclarationNode,
	index: number,
	name: string,
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
	| ParameterSemanticBinding
	| IteratorSemanticBinding
	| BuiltinSemanticBinding

type OwnedSemanticBinding = Exclude<SemanticBinding, BuiltinSemanticBinding>
type SemanticFunctionOwner = ProgramNode | FunctionDeclarationNode
type SemanticLoopOwner = WhileStatementNode | ForRangeStatementNode

interface SemanticModel {
	identifierBindings: WeakMap<IdentifierExpressionNode, SemanticBinding>,
	assignmentTargetBindings: WeakMap<IdentifierTargetNode, SemanticBinding>,
	statementLoopOwners: WeakMap<StatementNode, SemanticLoopOwner | null>,
	declarationBindings: WeakMap<VariableDeclarationNode | FunctionDeclarationNode, SemanticBinding>,
	functionParameterBindings: WeakMap<FunctionDeclarationNode, SemanticBinding[]>,
	forRangeBindings: WeakMap<ForRangeStatementNode, SemanticBinding>,
	returnOwners: WeakMap<ReturnStatementNode, FunctionDeclarationNode | null>,
	bindingFunctionOwners: WeakMap<OwnedSemanticBinding, SemanticFunctionOwner>,
	functionCaptures: WeakMap<FunctionDeclarationNode, SemanticBinding[]>,
}

function getBindingName(binding: SemanticBinding): string {
	switch (binding.kind) {
		case 'variable':
		case 'function':
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
		case 'builtin':
			return false
	}
}

export {
	type BuiltinSemanticBinding,
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
