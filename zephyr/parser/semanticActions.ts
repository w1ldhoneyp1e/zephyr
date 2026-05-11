import {type SemanticValueAction} from './actions/context'
import {createDeclarationAction} from './actions/declarations'
import {createExpressionAction} from './actions/expressions'
import {createSharedAction} from './actions/shared'
import {createStatementAction} from './actions/statements'
import {type Grammar, type Production} from './grammar'
import {type SemanticAction} from './TableParser'

function createSemanticActions(grammar: Grammar): Partial<Record<number, SemanticAction>> {
	const actions: Partial<Record<number, SemanticAction>> = {}
	for (const production of grammar.productions) {
		const action = createActionForProduction(production)
		if (action !== null) {
			actions[production.id] = action as SemanticAction
		}
	}

	return actions
}

function createActionForProduction(production: Production): SemanticValueAction | null {
	return createSharedAction(production)
		?? createDeclarationAction(production)
		?? createStatementAction(production)
		?? createExpressionAction(production)
}

export {
	createSemanticActions,
}
