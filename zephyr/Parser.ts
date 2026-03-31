import {
	ArrayExpressionNode,
	AssignmentStatementNode,
	AssignmentTargetNode,
	BinaryExpressionNode,
	BlockStatementNode,
	CallExpressionNode,
	ExpressionNode,
	ExpressionStatementNode,
	ForRangeStatementNode,
	FunctionDeclarationNode,
	IdentifierExpressionNode,
	IdentifierTargetNode,
	IfStatementNode,
	IndexExpressionNode,
	IndexTargetNode,
	LiteralExpressionNode,
	ProgramNode,
	ReturnStatementNode,
	StatementNode,
	UnaryExpressionNode,
	VariableDeclarationNode,
	WhileStatementNode,
} from './ast'
import {type Token, TokenType} from './token'

class Parser {
	private tokens: Token[]
	private current = 0

	constructor(tokens: Token[]) {
		this.tokens = tokens
	}

	parseProgram(): ProgramNode {
		const body: StatementNode[] = []
		while (!this.isAtEnd()) {
			body.push(this.parseStatement())
		}

		return {
			type: 'Program',
			body,
		}
	}

	private parseStatement(): StatementNode {
		if (this.match(TokenType.Var)) {
			return this.parseVariableDeclaration('var')
		}
		if (this.match(TokenType.Const)) {
			return this.parseVariableDeclaration('const')
		}
		if (this.match(TokenType.Fn)) {
			return this.parseFunctionDeclaration()
		}
		if (this.match(TokenType.If)) {
			return this.parseIfStatement()
		}
		if (this.match(TokenType.While)) {
			return this.parseWhileStatement()
		}
		if (this.match(TokenType.For)) {
			return this.parseForRangeStatement()
		}
		if (this.match(TokenType.Return)) {
			return this.parseReturnStatement()
		}
		if (this.check(TokenType.LeftBrace)) {
			return this.parseBlockStatement()
		}
		if (this.check(TokenType.Identifier) && this.isAssignmentStart()) {
			return this.parseAssignmentStatement()
		}

		const expression = this.parseExpression()
		this.consume(TokenType.Semicolon, 'Ожидался ";" после выражения')

		return {
			type: 'ExpressionStatement',
			expression,
		}
	}

	private parseVariableDeclaration(kind: 'var' | 'const'): VariableDeclarationNode {
		const name = this.consume(TokenType.Identifier, 'Ожидался идентификатор').lexeme
		let initializer: ExpressionNode | null = null
		if (this.match(TokenType.Equal)) {
			initializer = this.parseExpression()
		}
		this.consume(TokenType.Semicolon, 'Ожидался ";" после объявления')

		return {
			type: 'VariableDeclaration',
			kind,
			name,
			initializer,
		}
	}

	private parseFunctionDeclaration(): FunctionDeclarationNode {
		const name = this.consume(TokenType.Identifier, 'Ожидалось имя функции').lexeme
		this.consume(TokenType.LeftParen, 'Ожидалась "(" после имени функции')
		const params: string[] = []
		if (!this.check(TokenType.RightParen)) {
			do {
				params.push(this.consume(TokenType.Identifier, 'Ожидался параметр').lexeme)
			} while (this.match(TokenType.Comma))
		}
		this.consume(TokenType.RightParen, 'Ожидалась ")" после параметров')
		const body = this.parseBlockStatement()

		return {
			type: 'FunctionDeclaration',
			name,
			params,
			body,
		}
	}

	private parseIfStatement(): IfStatementNode {
		this.consume(TokenType.LeftParen, 'Ожидалась "(" после if')
		const condition = this.parseExpression()
		this.consume(TokenType.RightParen, 'Ожидалась ")" после условия if')
		const thenBranch = this.parseBlockStatement()
		let elseBranch: BlockStatementNode | null = null
		if (this.match(TokenType.Else)) {
			elseBranch = this.parseBlockStatement()
		}

		return {
			type: 'IfStatement',
			condition,
			thenBranch,
			elseBranch,
		}
	}

	private parseWhileStatement(): WhileStatementNode {
		this.consume(TokenType.LeftParen, 'Ожидалась "(" после while')
		const condition = this.parseExpression()
		this.consume(TokenType.RightParen, 'Ожидалась ")" после условия while')
		const body = this.parseBlockStatement()

		return {
			type: 'WhileStatement',
			condition,
			body,
		}
	}

	private parseForRangeStatement(): ForRangeStatementNode {
		this.consume(TokenType.LeftParen, 'Ожидалась "(" после for')
		const iterator = this.consume(TokenType.Identifier, 'Ожидалось имя итератора').lexeme
		this.consume(TokenType.In, 'Ожидался in в for')
		const start = this.parseExpression()
		this.consume(TokenType.Range, 'Ожидался диапазон ".."')
		const end = this.parseExpression()
		this.consume(TokenType.RightParen, 'Ожидалась ")" после for')
		const body = this.parseBlockStatement()

		return {
			type: 'ForRangeStatement',
			iterator,
			start,
			end,
			body,
		}
	}

	private parseReturnStatement(): ReturnStatementNode {
		let value: ExpressionNode | null = null
		if (!this.check(TokenType.Semicolon)) {
			value = this.parseExpression()
		}
		this.consume(TokenType.Semicolon, 'Ожидался ";" после return')

		return {
			type: 'ReturnStatement',
			value,
		}
	}

	private parseBlockStatement(): BlockStatementNode {
		this.consume(TokenType.LeftBrace, 'Ожидалась "{"')
		const statements: StatementNode[] = []
		while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
			statements.push(this.parseStatement())
		}
		this.consume(TokenType.RightBrace, 'Ожидалась "}"')

		return {
			type: 'BlockStatement',
			statements,
		}
	}

	private parseAssignmentStatement(): AssignmentStatementNode {
		const nameToken = this.consume(TokenType.Identifier, 'Ожидался идентификатор')
		let target: AssignmentTargetNode = {
			type: 'IdentifierTarget',
			name: nameToken.lexeme,
		}
		while (this.match(TokenType.LeftBracket)) {
			const index = this.parseExpression()
			this.consume(TokenType.RightBracket, 'Ожидалась "]"')
			target = {
				type: 'IndexTarget',
				object: this.targetToExpression(target),
				index,
			}
		}
		this.consume(TokenType.Equal, 'Ожидался "=" в присваивании')
		const value = this.parseExpression()
		this.consume(TokenType.Semicolon, 'Ожидался ";" после присваивания')

		return {
			type: 'AssignmentStatement',
			target,
			value,
		}
	}

	private targetToExpression(target: AssignmentTargetNode): ExpressionNode {
		if (target.type === 'IdentifierTarget') {
			return {
				type: 'IdentifierExpression',
				name: target.name,
			}
		}

		return {
			type: 'IndexExpression',
			object: target.object,
			index: target.index,
		}
	}

	private parseExpression(): ExpressionNode {
		return this.parseOr()
	}

	private parseOr(): ExpressionNode {
		let expression = this.parseAnd()
		while (this.match(TokenType.OrOr)) {
			const operator = this.previous().lexeme as '||'
			const right = this.parseAnd()
			expression = {
				type: 'BinaryExpression',
				operator,
				left: expression,
				right,
			}
		}

		return expression
	}

	private parseAnd(): ExpressionNode {
		let expression = this.parseEquality()
		while (this.match(TokenType.AndAnd)) {
			const operator = this.previous().lexeme as '&&'
			const right = this.parseEquality()
			expression = {
				type: 'BinaryExpression',
				operator,
				left: expression,
				right,
			}
		}

		return expression
	}

	private parseEquality(): ExpressionNode {
		let expression = this.parseComparison()
		while (this.match(TokenType.EqualEqual, TokenType.BangEqual)) {
			const operator = this.previous().lexeme as '==' | '!='
			const right = this.parseComparison()
			expression = {
				type: 'BinaryExpression',
				operator,
				left: expression,
				right,
			}
		}

		return expression
	}

	private parseComparison(): ExpressionNode {
		let expression = this.parseTerm()
		while (this.match(
			TokenType.Less,
			TokenType.LessEqual,
			TokenType.Greater,
			TokenType.GreaterEqual,
		)) {
			const operator = this.previous().lexeme as '<' | '<=' | '>' | '>='
			const right = this.parseTerm()
			expression = {
				type: 'BinaryExpression',
				operator,
				left: expression,
				right,
			}
		}

		return expression
	}

	private parseTerm(): ExpressionNode {
		let expression = this.parseFactor()
		while (this.match(TokenType.Plus, TokenType.Minus)) {
			const operator = this.previous().lexeme as '+' | '-'
			const right = this.parseFactor()
			expression = {
				type: 'BinaryExpression',
				operator,
				left: expression,
				right,
			}
		}

		return expression
	}

	private parseFactor(): ExpressionNode {
		let expression = this.parseUnary()
		while (this.match(TokenType.Star, TokenType.Slash, TokenType.Percent)) {
			const operator = this.previous().lexeme as '*' | '/' | '%'
			const right = this.parseUnary()
			expression = {
				type: 'BinaryExpression',
				operator,
				left: expression,
				right,
			}
		}

		return expression
	}

	private parseUnary(): ExpressionNode {
		if (this.match(TokenType.Bang, TokenType.Minus)) {
			const operator = this.previous().lexeme as '!' | '-'
			const argument = this.parseUnary()

			return {
				type: 'UnaryExpression',
				operator,
				argument,
			}
		}

		return this.parseCall()
	}

	private parseCall(): ExpressionNode {
		let expression = this.parsePrimary()
		while (true) {
			if (this.match(TokenType.LeftParen)) {
				const args: ExpressionNode[] = []
				if (!this.check(TokenType.RightParen)) {
					do {
						args.push(this.parseExpression())
					} while (this.match(TokenType.Comma))
				}
				this.consume(TokenType.RightParen, 'Ожидалась ")" после аргументов')
				expression = {
					type: 'CallExpression',
					callee: expression,
					args,
				}
			}
			else if (this.match(TokenType.LeftBracket)) {
				const index = this.parseExpression()
				this.consume(TokenType.RightBracket, 'Ожидалась "]" после индекса')
				expression = {
					type: 'IndexExpression',
					object: expression,
					index,
				}
			}
			else {
				break
			}
		}

		return expression
	}

	private parsePrimary(): ExpressionNode {
		if (this.match(TokenType.False)) {
			return {
				type: 'LiteralExpression',
				value: false,
			}
		}
		if (this.match(TokenType.True)) {
			return {
				type: 'LiteralExpression',
				value: true,
			}
		}
		if (this.match(TokenType.Number)) {
			return {
				type: 'LiteralExpression',
				value: Number(this.previous().lexeme),
			}
		}
		if (this.match(TokenType.String)) {
			const raw = this.previous().lexeme

			return {
				type: 'LiteralExpression',
				value: raw.slice(1, raw.length - 1),
			}
		}
		if (this.match(TokenType.Identifier)) {
			return {
				type: 'IdentifierExpression',
				name: this.previous().lexeme,
			}
		}
		if (this.match(TokenType.LeftParen)) {
			const expression = this.parseExpression()
			this.consume(TokenType.RightParen, 'Ожидалась ")" после выражения')

			return expression
		}
		if (this.match(TokenType.LeftBracket)) {
			const elements: ExpressionNode[] = []
			if (!this.check(TokenType.RightBracket)) {
				do {
					elements.push(this.parseExpression())
				} while (this.match(TokenType.Comma))
			}
			this.consume(TokenType.RightBracket, 'Ожидалась "]" после массива')

			return {
				type: 'ArrayExpression',
				elements,
			}
		}
		throw this.error(this.peek(), 'Ожидалось выражение')
	}

	private isAssignmentStart(): boolean {
		let idx = this.current
		if (this.tokens[idx].type !== TokenType.Identifier) {
			return false
		}
		idx++
		while (this.tokens[idx]?.type === TokenType.LeftBracket) {
			let depth = 1
			idx++
			while (idx < this.tokens.length && depth > 0) {
				const tokenType = this.tokens[idx].type
				if (tokenType === TokenType.LeftBracket) {
					depth++
				}
				else if (tokenType === TokenType.RightBracket) {
					depth--
				}
				idx++
			}
		}

		return this.tokens[idx]?.type === TokenType.Equal
	}

	private match(...types: TokenType[]): boolean {
		for (const type of types) {
			if (this.check(type)) {
				this.advance()

				return true
			}
		}

		return false
	}

	private consume(type: TokenType, message: string): Token {
		if (this.check(type)) {
			return this.advance()
		}
		throw this.error(this.peek(), message)
	}

	private check(type: TokenType): boolean {
		if (this.isAtEnd()) {
			return false
		}

		return this.peek().type === type
	}

	private advance(): Token {
		if (!this.isAtEnd()) {
			this.current++
		}

		return this.previous()
	}

	private isAtEnd(): boolean {
		return this.peek().type === TokenType.Eof
	}

	private peek(): Token {
		return this.tokens[this.current]
	}

	private previous(): Token {
		return this.tokens[this.current - 1]
	}

	private error(token: Token, message: string): Error {
		const lexeme = token.type === TokenType.Eof
			? 'EOF'
			: token.lexeme

		return new Error(`[${token.line}:${token.column}] ${message} (${lexeme})`)
	}
}

export {
	Parser,
	ProgramNode,
	StatementNode,
	ExpressionNode,
	BlockStatementNode,
	VariableDeclarationNode,
	FunctionDeclarationNode,
	IfStatementNode,
	WhileStatementNode,
	ForRangeStatementNode,
	ReturnStatementNode,
	ExpressionStatementNode,
	AssignmentStatementNode,
	AssignmentTargetNode,
	IdentifierTargetNode,
	IndexTargetNode,
	LiteralExpressionNode,
	IdentifierExpressionNode,
	UnaryExpressionNode,
	BinaryExpressionNode,
	ArrayExpressionNode,
	IndexExpressionNode,
	CallExpressionNode,
}
