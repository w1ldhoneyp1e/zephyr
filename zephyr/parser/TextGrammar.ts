import {KEYWORDS, TokenType} from '../token'
import {
	type Grammar,
	type GrammarDefinition,
	type ProductionDefinition,
	createGrammar,
} from './grammar'

const LINE_SEPARATOR_PATTERN = /\r?\n/
const WHITESPACE_PATTERN = /\s/

function parseGrammarText(source: string): GrammarDefinition {
	const productions: ProductionDefinition[] = []
	let start = undefined
	let eof = undefined

	const lines = source.split(LINE_SEPARATOR_PATTERN)
	for (let idx = 0; idx < lines.length; idx++) {
		const lineNumber = idx + 1
		const line = stripComments(lines[idx]).trim()
		if (line.length === 0) {
			continue
		}

		if (line.startsWith('%')) {
			const [directive, ...rest] = line.split(/\s+/)
			const value = rest.join(' ').trim()
			if (directive === '%start') {
				if (value.length === 0) {
					throw new Error(`Ожидалось значение после %start на строке ${lineNumber}`)
				}
				start = value
				continue
			}
			if (directive === '%eof') {
				if (value.length === 0) {
					throw new Error(`Ожидалось значение после %eof на строке ${lineNumber}`)
				}
				eof = value
				continue
			}
			throw new Error(`Неизвестная директива ${directive} на строке ${lineNumber}`)
		}

		const arrowIndex = line.indexOf('->')
		if (arrowIndex === -1) {
			throw new Error(`Ожидалось правило вида "A -> B" на строке ${lineNumber}`)
		}
		const lhs = line.slice(0, arrowIndex).trim()
		const rhsSource = line.slice(arrowIndex + 2).trim()
		if (lhs.length === 0) {
			throw new Error(`Пустой lhs у правила на строке ${lineNumber}`)
		}

		const alternatives = splitAlternatives(rhsSource)
		for (const alternativeSource of alternatives) {
			const alternative = alternativeSource.trim()
			productions.push({
				lhs,
				rhs: parseRhsSymbols(alternative, lineNumber),
				description: `${lhs} -> ${alternative.length === 0
					? 'ε'
					: alternative}`,
			})
		}
	}

	if (productions.length === 0) {
		throw new Error('Не найдено ни одного правила grammar')
	}
	if (start === undefined) {
		start = productions[0].lhs
	}
	if (eof === undefined) {
		throw new Error('Не задан EOF символ. Укажи %eof <symbol> или options.eof')
	}

	return {
		start,
		eof,
		productions,
	}
}

function createGrammarFromText(source: string): Grammar {
	return createGrammar(parseGrammarText(source))
}

function parseRhsSymbols(source: string, lineNumber: number): string[] {
	if (source.length === 0) {
		return []
	}
	const tokens = tokenizeRhs(source, lineNumber)
	if (tokens.length === 1 && isEpsilon(tokens[0])) {
		return []
	}

	return tokens.map(normalizeGrammarSymbol)
}

function isEpsilon(symbol: string): boolean {
	return symbol === 'ε' || symbol === 'eps' || symbol === 'epsilon'
}

function stripComments(line: string): string {
	const slashIndex = line.indexOf('//')
	if (slashIndex === -1) {
		return line
	}

	return line.slice(0, slashIndex)
}

function splitAlternatives(source: string): string[] {
	const alternatives: string[] = []
	let current = ''
	let quote: '\'' | '"' | null = null

	for (let idx = 0; idx < source.length; idx++) {
		const ch = source[idx]
		if (quote !== null) {
			current += ch
			if (ch === quote && source[idx - 1] !== '\\') {
				quote = null
			}
			continue
		}
		if (ch === '\'' || ch === '"') {
			quote = ch
			current += ch
			continue
		}
		if (ch === '|') {
			alternatives.push(current.trim())
			current = ''
			continue
		}
		current += ch
	}

	if (quote !== null) {
		throw new Error('Незакрытая кавычка в правой части grammar')
	}
	alternatives.push(current.trim())

	return alternatives
}

function tokenizeRhs(source: string, lineNumber: number): string[] {
	const tokens: string[] = []
	let current = ''
	let quote: '\'' | '"' | null = null

	for (let idx = 0; idx < source.length; idx++) {
		const ch = source[idx]
		if (quote !== null) {
			current += ch
			if (ch === quote && source[idx - 1] !== '\\') {
				tokens.push(current)
				current = ''
				quote = null
			}
			continue
		}

		if (ch === '\'' || ch === '"') {
			if (current.trim().length > 0) {
				tokens.push(current.trim())
				current = ''
			}
			quote = ch
			current = ch
			continue
		}

		if (WHITESPACE_PATTERN.test(ch)) {
			if (current.length > 0) {
				tokens.push(current)
				current = ''
			}
			continue
		}

		current += ch
	}

	if (quote !== null) {
		throw new Error(`Незакрытая кавычка в grammar на строке ${lineNumber}`)
	}
	if (current.length > 0) {
		tokens.push(current)
	}

	return tokens
}

function normalizeGrammarSymbol(symbol: string): string {
	if (isQuoted(symbol)) {
		return normalizeGrammarLiteral(unquote(symbol))
	}
	if (isAlias(symbol)) {
		return normalizeGrammarLiteral(symbol)
	}

	return symbol
}

function normalizeGrammarLiteral(literal: string): string {
	const keywordToken = KEYWORDS.get(literal)
	if (keywordToken !== undefined) {
		return keywordToken
	}
	const alias = TERMINAL_ALIASES.get(literal)
	if (alias !== undefined) {
		return alias
	}

	return literal
}

function isQuoted(symbol: string): boolean {
	return (
		(symbol.startsWith('\'') && symbol.endsWith('\''))
		|| (symbol.startsWith('"') && symbol.endsWith('"'))
	)
}

function unquote(symbol: string): string {
	return symbol.slice(1, symbol.length - 1)
}

function isAlias(symbol: string): boolean {
	return KEYWORDS.has(symbol) || TERMINAL_ALIASES.has(symbol)
}

const TERMINAL_ALIASES = new Map<string, TokenType>([
	['(', TokenType.LeftParen],
	[')', TokenType.RightParen],
	['{', TokenType.LeftBrace],
	['}', TokenType.RightBrace],
	['[', TokenType.LeftBracket],
	[']', TokenType.RightBracket],
	[',', TokenType.Comma],
	['.', TokenType.Dot],
	[';', TokenType.Semicolon],
	[':', TokenType.Colon],
	['+', TokenType.Plus],
	['-', TokenType.Minus],
	['->', TokenType.ThinArrow],
	['*', TokenType.Star],
	['/', TokenType.Slash],
	['%', TokenType.Percent],
	['!', TokenType.Bang],
	['=', TokenType.Equal],
	['=>', TokenType.Arrow],
	['==', TokenType.EqualEqual],
	['!=', TokenType.BangEqual],
	['<', TokenType.Less],
	['<=', TokenType.LessEqual],
	['>', TokenType.Greater],
	['>=', TokenType.GreaterEqual],
	['&&', TokenType.AndAnd],
	['|', TokenType.Pipe],
	['||', TokenType.OrOr],
	['??', TokenType.QuestionQuestion],
	['??=', TokenType.QuestionQuestionEqual],
	['?.', TokenType.QuestionDot],
	['?[', TokenType.QuestionLeftBracket],
	['|>', TokenType.PipeGreater],
	['..', TokenType.Range],
])

export {
	createGrammarFromText,
	parseGrammarText,
}
