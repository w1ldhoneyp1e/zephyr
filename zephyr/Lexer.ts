import {
	type Token,
	KEYWORDS,
	TokenType,
} from './token'

class Lexer {
	private source: string
	private tokens: Token[] = []
	private start = 0
	private current = 0
	private line = 1
	private column = 1
	private tokenLine = 1
	private tokenColumn = 1

	constructor(source: string) {
		this.source = source
	}

	scanTokens(): Token[] {
		while (!this.isAtEnd()) {
			this.start = this.current
			this.tokenLine = this.line
			this.tokenColumn = this.column
			this.scanToken()
		}
		this.tokens.push({
			type: TokenType.Eof,
			lexeme: '',
			line: this.line,
			column: this.column,
		})

		return this.tokens
	}

	private isAtEnd(): boolean {
		return this.current >= this.source.length
	}

	private advance(): string {
		const ch = this.source[this.current]
		this.current++
		if (ch === '\n') {
			this.line++
			this.column = 1
		}
		else {
			this.column++
		}

		return ch
	}

	private peek(): string {
		if (this.isAtEnd()) {
			return '\0'
		}

		return this.source[this.current]
	}

	private peekNext(): string {
		if (this.current + 1 >= this.source.length) {
			return '\0'
		}

		return this.source[this.current + 1]
	}

	private match(expected: string): boolean {
		if (this.isAtEnd()) {
			return false
		}
		if (this.source[this.current] !== expected) {
			return false
		}
		this.advance()

		return true
	}

	private addToken(type: TokenType): void {
		this.tokens.push({
			type,
			lexeme: this.source.slice(this.start, this.current),
			line: this.tokenLine,
			column: this.tokenColumn,
		})
	}

	private scanToken(): void {
		const ch = this.advance()
		switch (ch) {
			case '(':
				this.addToken(TokenType.LeftParen)
				break
			case ')':
				this.addToken(TokenType.RightParen)
				break
			case '{':
				this.addToken(TokenType.LeftBrace)
				break
			case '}':
				this.addToken(TokenType.RightBrace)
				break
			case '[':
				this.addToken(TokenType.LeftBracket)
				break
			case ']':
				this.addToken(TokenType.RightBracket)
				break
			case ',':
				this.addToken(TokenType.Comma)
				break
			case ';':
				this.addToken(TokenType.Semicolon)
				break
			case ':':
				this.addToken(TokenType.Colon)
				break
			case '+':
				this.addToken(TokenType.Plus)
				break
			case '-':
				this.addToken(TokenType.Minus)
				break
			case '*':
				this.addToken(TokenType.Star)
				break
			case '/':
				if (this.match('/')) {
					while (this.peek() !== '\n' && !this.isAtEnd()) {
						this.advance()
					}
				}
				else if (this.match('*')) {
					this.skipMultiLineComment()
				}
				else {
					this.addToken(TokenType.Slash)
				}
				break
			case '%':
				this.addToken(TokenType.Percent)
				break
			case '!':
				this.addToken(this.match('=')
					? TokenType.BangEqual
					: TokenType.Bang)
				break
			case '=':
				this.addToken(this.match('>')
					? TokenType.Arrow
					: this.match('=')
						? TokenType.EqualEqual
						: TokenType.Equal)
				break
			case '<':
				this.addToken(this.match('=')
					? TokenType.LessEqual
					: TokenType.Less)
				break
			case '>':
				this.addToken(this.match('=')
					? TokenType.GreaterEqual
					: TokenType.Greater)
				break
			case '&':
				if (this.match('&')) {
					this.addToken(TokenType.AndAnd)
					break
				}
				throw this.error('Ожидался второй символ "&"')
			case '|':
				if (this.match('|')) {
					this.addToken(TokenType.OrOr)
					break
				}
				if (this.match('>')) {
					this.addToken(TokenType.PipeGreater)
					break
				}
				throw this.error('Ожидался "|" или ">"')
			case '?':
				if (this.match('?')) {
					this.addToken(this.match('=')
						? TokenType.QuestionQuestionEqual
						: TokenType.QuestionQuestion)
					break
				}
				if (this.match('.')) {
					this.addToken(TokenType.QuestionDot)
					break
				}
				if (this.match('[')) {
					this.addToken(TokenType.QuestionLeftBracket)
					break
				}
				throw this.error('Ожидался ?, ., или [ после ?')
			case '.':
				this.addToken(this.match('.')
					? TokenType.Range
					: TokenType.Dot)
				break
			case '"': // TODO: добавить ' и сырые строки
				this.scanString()
				break
			case ' ':
			case '\r':
			case '\t':
			case '\n':
				break
			default:
				if (this.isDigit(ch)) {
					this.scanNumber()
					break
				}
				if (this.isAlpha(ch)) {
					this.scanIdentifier()
					break
				}
				throw this.error(`Неожиданный символ: ${ch}`)
		}
	}

	private scanString(): void {
		while (this.peek() !== '"' && !this.isAtEnd()) {
			this.advance()
		}
		if (this.isAtEnd()) {
			throw this.error('Незавершенная строка')
		}
		this.advance()
		this.addToken(TokenType.String)
	}

	private scanNumber(): void {
		while (this.isDigit(this.peek())) {
			this.advance()
		}
		if (this.peek() === '.' && this.isDigit(this.peekNext())) {
			this.advance()
			while (this.isDigit(this.peek())) {
				this.advance()
			}
		}
		this.addToken(TokenType.Number)
	}

	private scanIdentifier(): void {
		while (this.isAlphaNumeric(this.peek())) {
			this.advance()
		}
		const lexeme = this.source.slice(this.start, this.current)
		const tokenType = KEYWORDS.get(lexeme) ?? TokenType.Identifier
		this.tokens.push({
			type: tokenType,
			lexeme,
			line: this.tokenLine,
			column: this.tokenColumn,
		})
	}

	private skipMultiLineComment(): void {
		while (!this.isAtEnd()) {
			if (this.peek() === '*' && this.peekNext() === '/') {
				this.advance()
				this.advance()

				return
			}
			this.advance()
		}
		throw this.error('Незавершенный многострочный комментарий')
	}

	private isDigit(ch: string): boolean {
		return ch >= '0' && ch <= '9'
	}

	private isAlpha(ch: string): boolean {
		return (ch >= 'a' && ch <= 'z')
			|| (ch >= 'A' && ch <= 'Z')
			|| ch === '_'
	}

	private isAlphaNumeric(ch: string): boolean {
		return this.isAlpha(ch) || this.isDigit(ch)
	}

	private error(message: string): Error {
		return new Error(`[${this.tokenLine}:${this.tokenColumn}] ${message}`)
	}
}

export {
	Lexer,
}
