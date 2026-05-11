import {TokenType} from '../token'
import {LalrGenerator} from './LalrGenerator'
import {createGrammarFromText, parseGrammarText} from './TextGrammar'
import {createCurrentZephyrGrammar} from './ZephyrGrammar'

function buildCurrentZephyrTables() {
	const grammar = createCurrentZephyrGrammar()
	const generator = new LalrGenerator(grammar)
	const tables = generator.buildParsingTables()

	return {
		grammar,
		tables,
	}
}

function formatConflictSummary(): string[] {
	const {tables} = buildCurrentZephyrTables()

	return tables.conflicts.map(conflict => {
		const existing = formatAction(conflict.existingAction)
		const incoming = formatAction(conflict.incomingAction)

		return `state=${conflict.stateId} symbol=${conflict.symbol} existing=${existing} incoming=${incoming}`
	})
}

function formatAction(action: {
	kind: string,
	nextState?: number,
	productionId?: number,
}): string {
	if (action.kind === 'shift') {
		return `shift(${action.nextState})`
	}
	if (action.kind === 'reduce') {
		return `reduce(${action.productionId})`
	}
	if (action.kind === 'accept') {
		return 'accept'
	}

	return action.kind
}

export {
	TokenType,
	buildCurrentZephyrTables,
	createGrammarFromText,
	formatConflictSummary,
	parseGrammarText,
}
