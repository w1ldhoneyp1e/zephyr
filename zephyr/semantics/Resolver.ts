import {
	type ExpressionNode,
	type FunctionDeclarationNode,
	type ProgramNode,
	type StatementNode,
} from '../ast'
import {isBuiltinGlobalName} from '../builtins'
import {type SemanticScope} from './context'

class Resolver {
	private scopes: SemanticScope[] = []

	resolveProgram(program: ProgramNode): ProgramNode {
		this.scopes = []
		this.enterScope()
		for (const statement of program.body) {
			this.resolveStatement(statement)
		}
		this.leaveScope()

		return program
	}

	private resolveStatement(statement: StatementNode): void {
		switch (statement.type) {
			case 'VariableDeclaration':
				this.declare(statement.name)
				if (statement.initializer !== null) {
					this.resolveExpression(statement.initializer)
				}
				return
			case 'FunctionDeclaration':
				this.resolveFunctionDeclaration(statement)
				return
			case 'IfStatement':
				this.resolveExpression(statement.condition)
				this.resolveBlock(statement.thenBranch.statements)
				if (statement.elseBranch !== null) {
					this.resolveBlock(statement.elseBranch.statements)
				}
				return
			case 'WhileStatement':
				this.resolveExpression(statement.condition)
				this.resolveBlock(statement.body.statements)
				return
			case 'ForRangeStatement':
				this.resolveExpression(statement.start)
				this.resolveExpression(statement.end)
				this.enterScope()
				this.declare(statement.iterator)
				for (const bodyStatement of statement.body.statements) {
					this.resolveStatement(bodyStatement)
				}
				this.leaveScope()
				return
			case 'ReturnStatement':
				if (statement.value !== null) {
					this.resolveExpression(statement.value)
				}
				return
			case 'BlockStatement':
				this.resolveBlock(statement.statements)
				return
			case 'ExpressionStatement':
				this.resolveExpression(statement.expression)
				return
			case 'AssignmentStatement':
				if (statement.target.type === 'IdentifierTarget') {
					this.resolveName(statement.target.name)
				}
				else {
					this.resolveExpression(statement.target.object)
					this.resolveExpression(statement.target.index)
				}
				this.resolveExpression(statement.value)
				return
			default:
				throw new Error(`Resolver: неподдерживаемый statement: ${(statement as {type: string}).type}`)
		}
	}

	private resolveFunctionDeclaration(statement: FunctionDeclarationNode): void {
		this.declare(statement.name)
		this.enterScope()
		for (const param of statement.params) {
			this.declare(param)
		}
		for (const bodyStatement of statement.body.statements) {
			this.resolveStatement(bodyStatement)
		}
		this.leaveScope()
	}

	private resolveExpression(expression: ExpressionNode): void {
		switch (expression.type) {
			case 'LiteralExpression':
				return
			case 'IdentifierExpression':
				this.resolveName(expression.name)
				return
			case 'UnaryExpression':
				this.resolveExpression(expression.argument)
				return
			case 'BinaryExpression':
				this.resolveExpression(expression.left)
				this.resolveExpression(expression.right)
				return
			case 'ArrayExpression':
				for (const element of expression.elements) {
					this.resolveExpression(element)
				}
				return
			case 'IndexExpression':
				this.resolveExpression(expression.object)
				this.resolveExpression(expression.index)
				return
			case 'CallExpression':
				this.resolveExpression(expression.callee)
				for (const arg of expression.args) {
					this.resolveExpression(arg)
				}
				return
			default:
				throw new Error(`Resolver: неподдерживаемое выражение: ${(expression as {type: string}).type}`)
		}
	}

	private resolveBlock(statements: StatementNode[]): void {
		this.enterScope()
		for (const statement of statements) {
			this.resolveStatement(statement)
		}
		this.leaveScope()
	}

	private resolveName(name: string): void {
		if (isBuiltinGlobalName(name)) {
			return
		}
		for (let i = this.scopes.length - 1; i >= 0; i--) {
			if (this.scopes[i].bindings.has(name)) {
				return
			}
		}
		throw new Error(`Неизвестная переменная: ${name}`)
	}

	private declare(name: string): void {
		const currentScope = this.scopes[this.scopes.length - 1]
		if (currentScope === undefined) {
			throw new Error('Resolver: отсутствует текущий scope')
		}
		if (currentScope.bindings.has(name)) {
			throw new Error(`Повторное объявление переменной: ${name}`)
		}
		currentScope.bindings.add(name)
	}

	private enterScope(): void {
		this.scopes.push({bindings: new Set()})
	}

	private leaveScope(): void {
		const scope = this.scopes.pop()
		if (scope === undefined) {
			throw new Error('Resolver: неожиданный выход из scope')
		}
	}
}

export {
	Resolver,
}
