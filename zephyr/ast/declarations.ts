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

export {
	type FunctionDeclarationNode,
	type ProgramNode,
	type VariableDeclarationNode,
}
