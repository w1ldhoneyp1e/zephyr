import {type ParserAction, type ParsingTables} from './LalrGenerator'

interface ParserToken<TTerminal extends string> {
	type: TTerminal,
	line?: number,
	column?: number,
}

type SemanticAction<TResult = unknown> = (values: unknown[]) => TResult

interface ParseOptions<TToken extends ParserToken<string>> {
	semanticActions?: Partial<Record<number, SemanticAction>>,
	tokenToDebugName?: (token: TToken) => string,
}

class TableParser<TToken extends ParserToken<string>> {
	constructor(private readonly tables: ParsingTables) {
	}

	parse(tokens: TToken[], options: ParseOptions<TToken> = {}): unknown {
		const stateStack: number[] = [this.tables.startState]
		const valueStack: unknown[] = []
		let current = 0

		while (true) {
			const state = stateStack[stateStack.length - 1]
			const token = tokens[current]
			if (token === undefined) {
				throw new Error('Парсер получил поток токенов без EOF')
			}
			const action = this.tables.action[state][token.type] as ParserAction | undefined
			if (action === undefined) {
				const expected = Object.keys(this.tables.action[state]).sort()
					.join(', ')
				const tokenName = options.tokenToDebugName?.(token) ?? token.type
				throw new Error(`Неожиданный токен ${tokenName}${this.formatTokenPosition(token)}. Ожидалось: ${expected}`)
			}

			if (action.kind === 'shift') {
				stateStack.push(action.nextState)
				valueStack.push(token)
				current++
				continue
			}

			if (action.kind === 'reduce') {
				const production = this.tables.productions[action.productionId]
				const valueCount = production.rhs.length
				const values = valueCount === 0
					? []
					: valueStack.splice(valueStack.length - valueCount, valueCount)
				stateStack.splice(stateStack.length - valueCount, valueCount)
				const semanticAction = options.semanticActions?.[production.id]
				const reducedValue = semanticAction === undefined
					? {
						symbol: production.lhs,
						values,
					}
					: semanticAction(values)
				const gotoState = this.tables.goto[stateStack[stateStack.length - 1]][production.lhs]
				if (gotoState === undefined) {
					throw new Error(`Отсутствует goto для ${production.lhs}`)
				}
				stateStack.push(gotoState)
				valueStack.push(reducedValue)
				continue
			}

			return valueStack[0]
		}
	}

	private formatTokenPosition(token: TToken): string {
		if (token.line === undefined || token.column === undefined) {
			return ''
		}

		return ` на строке ${token.line}, столбец ${token.column}`
	}
}

export {
	type ParseOptions,
	type ParserToken,
	type SemanticAction,
	TableParser,
}
