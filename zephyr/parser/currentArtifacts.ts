import {LalrGenerator} from './LalrGenerator'
import {createSemanticActions} from './semanticActions'
import {createCurrentZephyrGrammar} from './ZephyrGrammar'

interface CurrentZephyrArtifacts {
	grammar: ReturnType<typeof createCurrentZephyrGrammar>,
	tables: ReturnType<LalrGenerator['buildParsingTables']>,
	semanticActions: ReturnType<typeof createSemanticActions>,
}

let currentZephyrArtifacts: CurrentZephyrArtifacts | null = null

function buildCurrentZephyrArtifacts(): CurrentZephyrArtifacts {
	if (currentZephyrArtifacts !== null) {
		return currentZephyrArtifacts
	}

	const grammar = createCurrentZephyrGrammar()
	const generator = new LalrGenerator(grammar)
	const tables = generator.buildParsingTables()
	const semanticActions = createSemanticActions(grammar)

	currentZephyrArtifacts = {
		grammar,
		tables,
		semanticActions,
	}

	return currentZephyrArtifacts
}

export {
	type CurrentZephyrArtifacts,
	buildCurrentZephyrArtifacts,
}
