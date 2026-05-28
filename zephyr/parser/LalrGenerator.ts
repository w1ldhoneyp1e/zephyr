import {
	type Grammar,
	type Production,
	type SymbolName,
	isNonTerminal,
} from './grammar'

interface ShiftAction {
	kind: 'shift',
	nextState: number,
}

interface ReduceAction {
	kind: 'reduce',
	productionId: number,
}

interface AcceptAction {
	kind: 'accept',
}

type ParserAction = ShiftAction | ReduceAction | AcceptAction

interface ParsingConflict {
	stateId: number,
	symbol: SymbolName,
	existingAction: ParserAction,
	incomingAction: ParserAction,
}

interface ParsingTables {
	action: Record<SymbolName, ParserAction>[],
	goto: Record<SymbolName, number>[],
	productions: Production[],
	eof: SymbolName,
	startState: number,
	conflicts: ParsingConflict[],
}

interface LR1Item {
	productionId: number,
	dot: number,
	lookahead: SymbolName,
}

interface LalrState {
	id: number,
	items: LR1Item[],
	transitions: Map<SymbolName, number>,
}

class LalrGenerator {
	private firstSetsCache: Map<SymbolName, Set<SymbolName>> | null = null

	constructor(private readonly grammar: Grammar) {}

	buildParsingTables(): ParsingTables {
		const canonicalStates = this.buildCanonicalCollection()
		const lalrStates = this.mergeCanonicalStates(canonicalStates)
		const action: Record<SymbolName, ParserAction>[] = lalrStates.map(() => ({}))
		const goto: Record<SymbolName, number>[] = lalrStates.map(() => ({}))
		const conflicts: ParsingConflict[] = []

		for (const state of lalrStates) {
			for (const item of state.items) {
				const production = this.grammar.productions[item.productionId]
				const nextSymbol = production.rhs[item.dot]
				if (nextSymbol !== undefined) {
					const targetState = state.transitions.get(nextSymbol)
					if (targetState === undefined) {
						continue
					}
					if (isNonTerminal(this.grammar, nextSymbol)) {
						goto[state.id][nextSymbol] = targetState
					}
					else {
						this.registerAction({
							row: action[state.id],
							symbol: nextSymbol,
							action: {
								kind: 'shift',
								nextState: targetState,
							},
							stateId: state.id,
							conflicts,
						})
					}
					continue
				}

				if (production.lhs === this.grammar.augmentedStart && item.lookahead === this.grammar.eof) {
					this.registerAction({
						row: action[state.id],
						symbol: this.grammar.eof,
						action: {
							kind: 'accept',
						},
						stateId: state.id,
						conflicts,
					})
					continue
				}

				this.registerAction({
					row: action[state.id],
					symbol: item.lookahead,
					action: {
						kind: 'reduce',
						productionId: item.productionId,
					},
					stateId: state.id,
					conflicts,
				})
			}
		}

		return {
			action,
			goto,
			productions: this.grammar.productions,
			eof: this.grammar.eof,
			startState: 0,
			conflicts,
		}
	}

	private buildCanonicalCollection(): LalrState[] {
		const startItem: LR1Item = {
			productionId: 0,
			dot: 0,
			lookahead: this.grammar.eof,
		}
		const initialItems = this.closure([startItem])
		const states: LalrState[] = []
		const stateIdsByKey = new Map<string, number>()
		const queue: number[] = []

		const initialState = this.createState(0, initialItems)
		states.push(initialState)
		stateIdsByKey.set(this.itemSetKey(initialItems), 0)
		queue.push(0)

		while (queue.length > 0) {
			const stateId = queue.shift()!
			const state = states[stateId]
			const nextSymbols = new Set<SymbolName>()
			for (const item of state.items) {
				const production = this.grammar.productions[item.productionId]
				const symbol = production.rhs[item.dot]
				if (symbol !== undefined) {
					nextSymbols.add(symbol)
				}
			}

			for (const symbol of nextSymbols) {
				const moved = this.goto(state.items, symbol)
				if (moved.length === 0) {
					continue
				}
				const key = this.itemSetKey(moved)
				let targetStateId = stateIdsByKey.get(key)
				if (targetStateId === undefined) {
					targetStateId = states.length
					const nextState = this.createState(targetStateId, moved)
					states.push(nextState)
					stateIdsByKey.set(key, targetStateId)
					queue.push(targetStateId)
				}
				state.transitions.set(symbol, targetStateId)
			}
		}

		return states
	}

	private mergeCanonicalStates(states: LalrState[]): LalrState[] {
		const mergedStates: LalrState[] = []
		const mergedIndexByCore = new Map<string, number>()
		const canonicalToMerged = new Map<number, number>()

		for (const state of states) {
			const coreKey = this.coreKey(state.items)
			let mergedId = mergedIndexByCore.get(coreKey)
			if (mergedId === undefined) {
				mergedId = mergedStates.length
				mergedIndexByCore.set(coreKey, mergedId)
				mergedStates.push({
					id: mergedId,
					items: [],
					transitions: new Map(),
				})
			}
			canonicalToMerged.set(state.id, mergedId)
			const mergedState = mergedStates[mergedId]
			mergedState.items = this.mergeItems(mergedState.items, state.items)
		}

		for (const state of states) {
			const mergedState = mergedStates[canonicalToMerged.get(state.id)!]
			for (const [symbol, targetState] of state.transitions) {
				const mergedTarget = canonicalToMerged.get(targetState)!
				mergedState.transitions.set(symbol, mergedTarget)
			}
		}

		for (const state of mergedStates) {
			state.items.sort(compareItems)
		}

		return mergedStates
	}

	private closure(items: LR1Item[]): LR1Item[] {
		const firstSets = this.getFirstSets()
		const result = new Map<string, LR1Item>()
		const queue = [...items]
		for (const item of items) {
			result.set(this.itemKey(item), item)
		}

		while (queue.length > 0) {
			const item = queue.shift()!
			const production = this.grammar.productions[item.productionId]
			const nextSymbol = production.rhs[item.dot]
			if (nextSymbol === undefined || !isNonTerminal(this.grammar, nextSymbol)) {
				continue
			}

			const rest = production.rhs.slice(item.dot + 1)
			const lookaheads = this.firstOfSequence([...rest, item.lookahead], firstSets)
			for (const productionId of this.grammar.productionIdsByLhs.get(nextSymbol) ?? []) {
				for (const lookahead of lookaheads) {
					if (lookahead === EPSILON) {
						continue
					}
					const nextItem: LR1Item = {
						productionId,
						dot: 0,
						lookahead,
					}
					const key = this.itemKey(nextItem)
					if (!result.has(key)) {
						result.set(key, nextItem)
						queue.push(nextItem)
					}
				}
			}
		}

		return [...result.values()].sort(compareItems)
	}

	private goto(items: LR1Item[], symbol: SymbolName): LR1Item[] {
		const moved: LR1Item[] = []
		for (const item of items) {
			const production = this.grammar.productions[item.productionId]
			if (production.rhs[item.dot] === symbol) {
				moved.push({
					productionId: item.productionId,
					dot: item.dot + 1,
					lookahead: item.lookahead,
				})
			}
		}

		return moved.length === 0
			? []
			: this.closure(moved)
	}

	private getFirstSets(): Map<SymbolName, Set<SymbolName>> {
		if (this.firstSetsCache === null) {
			this.firstSetsCache = this.computeFirstSets()
		}

		return this.firstSetsCache
	}

	private computeFirstSets(): Map<SymbolName, Set<SymbolName>> {
		const first = new Map<SymbolName, Set<SymbolName>>()
		for (const terminal of this.grammar.terminals) {
			first.set(terminal, new Set([terminal]))
		}
		for (const nonTerminal of this.grammar.nonTerminals) {
			first.set(nonTerminal, first.get(nonTerminal) ?? new Set())
		}

		let changed = true
		while (changed) {
			changed = false
			for (const production of this.grammar.productions) {
				const lhsFirst = first.get(production.lhs)!
				if (production.rhs.length === 0) {
					if (!lhsFirst.has(EPSILON)) {
						lhsFirst.add(EPSILON)
						changed = true
					}
					continue
				}
				let nullablePrefix = true
				for (const symbol of production.rhs) {
					const symbolFirst = first.get(symbol) ?? new Set([symbol])
					changed = this.addNonEpsilonValues(lhsFirst, symbolFirst) || changed
					if (!symbolFirst.has(EPSILON)) {
						nullablePrefix = false
						break
					}
				}
				if (nullablePrefix && !lhsFirst.has(EPSILON)) {
					lhsFirst.add(EPSILON)
					changed = true
				}
			}
		}

		return first
	}

	private firstOfSequence(sequence: SymbolName[], firstSets: Map<SymbolName, Set<SymbolName>>): Set<SymbolName> {
		if (sequence.length === 0) {
			return new Set([EPSILON])
		}
		const result = new Set<SymbolName>()
		for (const symbol of sequence) {
			const symbolFirst = firstSets.get(symbol) ?? new Set([symbol])
			for (const value of symbolFirst) {
				if (value !== EPSILON) {
					result.add(value)
				}
			}
			if (!symbolFirst.has(EPSILON)) {
				return result
			}
		}
		result.add(EPSILON)

		return result
	}

	private createState(id: number, items: LR1Item[]): LalrState {
		return {
			id,
			items,
			transitions: new Map(),
		}
	}

	private mergeItems(left: LR1Item[], right: LR1Item[]): LR1Item[] {
		const merged = new Map<string, LR1Item>()
		for (const item of [...left, ...right]) {
			merged.set(this.itemKey(item), item)
		}

		return [...merged.values()]
	}

	private itemSetKey(items: LR1Item[]): string {
		return items
			.map(item => this.itemKey(item))
			.sort()
			.join('|')
	}

	private coreKey(items: LR1Item[]): string {
		return items
			.map(item => `${item.productionId}:${item.dot}`)
			.sort()
			.join('|')
	}

	private itemKey(item: LR1Item): string {
		return `${item.productionId}:${item.dot}:${item.lookahead}`
	}

	private addNonEpsilonValues(target: Set<SymbolName>, source: Set<SymbolName>): boolean {
		let changed = false
		for (const value of source) {
			if (value === EPSILON || target.has(value)) {
				continue
			}
			target.add(value)
			changed = true
		}

		return changed
	}

	private registerAction(context: RegisterActionContext): void {
		const {
			row,
			symbol,
			action,
			stateId,
			conflicts,
		} = context
		const existing = row[symbol]
		if (existing === undefined) {
			row[symbol] = action

			return
		}
		if (sameAction(existing, action)) {
			return
		}
		conflicts.push({
			stateId,
			symbol,
			existingAction: existing,
			incomingAction: action,
		})
	}
}

interface RegisterActionContext {
	row: Record<SymbolName, ParserAction>,
	symbol: SymbolName,
	action: ParserAction,
	stateId: number,
	conflicts: ParsingConflict[],
}

const EPSILON = '__epsilon__'

function sameAction(left: ParserAction, right: ParserAction): boolean {
	if (left.kind !== right.kind) {
		return false
	}
	if (left.kind === 'accept' && right.kind === 'accept') {
		return true
	}
	if (left.kind === 'shift' && right.kind === 'shift') {
		return left.nextState === right.nextState
	}
	if (left.kind === 'reduce' && right.kind === 'reduce') {
		return left.productionId === right.productionId
	}

	return false
}

function compareItems(left: LR1Item, right: LR1Item): number {
	if (left.productionId !== right.productionId) {
		return left.productionId - right.productionId
	}
	if (left.dot !== right.dot) {
		return left.dot - right.dot
	}

	return left.lookahead.localeCompare(right.lookahead)
}

export {
	type AcceptAction,
	type LalrState,
	type ParserAction,
	type ParsingConflict,
	type ParsingTables,
	type ReduceAction,
	type ShiftAction,
	LalrGenerator,
}
