import {type Production} from '../grammar'
import {
	type ProgramNode,
	type SemanticValueAction,
	type StatementNode,
	productionKey,
} from './context'

function createSharedAction(production: Production): SemanticValueAction | null {
	switch (productionKey(production)) {
		case 'Program -> StatementList':
			return values => ({
				type: 'Program',
				body: values[0] as StatementNode[],
			} satisfies ProgramNode)

		case 'StatementList -> StatementList Statement':
			return values => [...(values[0] as StatementNode[]), values[1] as StatementNode]
		case 'StatementList -> ε':
			return () => []

		case 'Statement -> VariableDeclaration':
		case 'Statement -> FunctionDeclaration':
		case 'Statement -> IfStatement':
		case 'Statement -> WhileStatement':
		case 'Statement -> ForRangeStatement':
		case 'Statement -> ReturnStatement':
		case 'Statement -> BreakStatement':
		case 'Statement -> ContinueStatement':
		case 'Statement -> BlockStatement':
		case 'Statement -> ExpressionStatement':
			return values => values[0]

		default:
			return null
	}
}

export {
	createSharedAction,
}
