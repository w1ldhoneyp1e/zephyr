type SymbolName = string

interface ProductionDefinition {
	lhs: SymbolName,
	rhs: SymbolName[],
	description?: string,
}

interface GrammarDefinition {
	start: SymbolName,
	eof: SymbolName,
	productions: ProductionDefinition[],
}

type Production = ProductionDefinition & {
	id: number,
}

interface Grammar {
	start: SymbolName,
	eof: SymbolName,
	augmentedStart: SymbolName,
	productions: Production[],
	nonTerminals: Set<SymbolName>,
	terminals: Set<SymbolName>,
	productionIdsByLhs: Map<SymbolName, number[]>,
}

function createGrammar(definition: GrammarDefinition): Grammar {
	const nonTerminals = new Set<SymbolName>()
	for (const production of definition.productions) {
		nonTerminals.add(production.lhs)
	}
	if (!nonTerminals.has(definition.start)) {
		throw new Error(`Стартовый символ не определен в grammar: ${definition.start}`)
	}

	const augmentedStart = `${definition.start}'`
	if (nonTerminals.has(augmentedStart)) {
		throw new Error(`Augmented start уже существует: ${augmentedStart}`)
	}

	const productions: Production[] = [
		{
			id: 0,
			lhs: augmentedStart,
			rhs: [definition.start],
			description: '__augmented_start__',
		},
	]

	definition.productions.forEach((production, idx) => {
		productions.push({
			id: idx + 1,
			lhs: production.lhs,
			rhs: production.rhs,
			description: production.description,
		})
	})

	nonTerminals.add(augmentedStart)
	const terminals = new Set<SymbolName>()
	for (const production of productions) {
		for (const symbol of production.rhs) {
			if (!nonTerminals.has(symbol)) {
				terminals.add(symbol)
			}
		}
	}
	terminals.add(definition.eof)

	const productionIdsByLhs = new Map<SymbolName, number[]>()
	for (const production of productions) {
		const ids = productionIdsByLhs.get(production.lhs) ?? []
		ids.push(production.id)
		productionIdsByLhs.set(production.lhs, ids)
	}

	return {
		start: definition.start,
		eof: definition.eof,
		augmentedStart,
		productions,
		nonTerminals,
		terminals,
		productionIdsByLhs,
	}
}

function isNonTerminal(grammar: Grammar, symbol: SymbolName): boolean {
	return grammar.nonTerminals.has(symbol)
}

export {
	type Grammar,
	type GrammarDefinition,
	type Production,
	type ProductionDefinition,
	type SymbolName,
	createGrammar,
	isNonTerminal,
}
