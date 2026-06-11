import {
	type NodeLocations,
	type SourceLocation,
	DiagnosticError,
} from '../diagnostics'
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
	sourceFile?: string,
	nodeLocations?: NodeLocations,
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
				throw new DiagnosticError(
					`Неожиданный токен ${tokenName}. Ожидалось: ${expected}`,
					this.getTokenLocation(token, options.sourceFile),
				)
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
				let reducedValue: unknown
				try {
					reducedValue = semanticAction === undefined
						? {
							symbol: production.lhs,
							values,
						}
						: semanticAction(values)
				}
				catch (error) {
					const location = this.findChildLocation(values, options)
					if (error instanceof Error) {
						throw new DiagnosticError(error.message, location)
					}
					throw new DiagnosticError(String(error), location)
				}
				this.attachReducedLocation(reducedValue, values, options)
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

	private getTokenLocation(token: TToken, sourceFile: string | undefined): SourceLocation | null {
		if (token.line === undefined || token.column === undefined) {
			return null
		}

		return {
			filePath: sourceFile,
			line: token.line,
			column: token.column,
		}
	}

	private attachReducedLocation(value: unknown, children: unknown[], options: ParseOptions<TToken>): void {
		if (value === null || typeof value !== 'object' || !('type' in value) || options.nodeLocations === undefined) {
			return
		}
		const location = this.findChildLocation(children, options)
		if (location === null) {
			return
		}
		options.nodeLocations.set(value, location)
	}

	private findChildLocation(values: unknown[], options: ParseOptions<TToken>): SourceLocation | null {
		for (const value of values) {
			if (value === null || typeof value !== 'object') {
				continue
			}
			const nodeLocation = options.nodeLocations?.get(value)
			if (nodeLocation !== undefined && nodeLocation !== null) {
				return nodeLocation
			}
			if ('line' in value && 'column' in value) {
				const token = value as ParserToken<string>

				return this.getTokenLocation(token as TToken, options.sourceFile)
			}
		}

		return null
	}
}

export {
	type ParseOptions,
	type ParserToken,
	type SemanticAction,
	TableParser,
}
