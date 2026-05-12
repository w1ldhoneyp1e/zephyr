import {
	type ExpressionNode,
	type FunctionDeclarationNode,
	type IdentifierExpressionNode,
	type IdentifierTargetNode,
	type ProgramNode,
	type StatementNode,
} from '../ast'
import {isBuiltinGlobalName} from '../builtins'
import {type SemanticBinding, type SemanticModel} from './context'

class Resolver {
	private scopes: {
		bindings: Map<string, SemanticBinding>,
	}[] = []
	private model: SemanticModel = {
		identifierBindings: new WeakMap(),
		assignmentTargetBindings: new WeakMap(),
	}

	resolveProgram(program: ProgramNode): {
		program: ProgramNode,
		model: SemanticModel,
	} {
		this.scopes = []
		this.model = {
			identifierBindings: new WeakMap(),
			assignmentTargetBindings: new WeakMap(),
		}
		this.enterScope()
		for (const statement of program.body) {
			this.resolveStatement(statement)
		}
		this.leaveScope()

		return {
			program,
			model: this.model,
		}
	}

	private resolveStatement(statement: StatementNode): void {
		switch (statement.type) {
			case 'VariableDeclaration':
				this.declare(statement.name, {
					kind: 'variable',
					declaration: statement,
				})
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
				this.declare(statement.iterator, {
					kind: 'parameter',
					functionDeclaration: {
						type: 'FunctionDeclaration',
						name: '<for-range>',
						params: [],
						body: statement.body,
					},
					name: statement.iterator,
				})
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
					this.resolveAssignmentTarget(statement.target)
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
		this.declare(statement.name, {
			kind: 'function',
			declaration: statement,
		})
		this.enterScope()
		for (const param of statement.params) {
			this.declare(param, {
				kind: 'parameter',
				functionDeclaration: statement,
				name: param,
			})
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
				this.resolveIdentifierExpression(expression)
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

	private resolveIdentifierExpression(expression: IdentifierExpressionNode): void {
		const binding = this.resolveName(expression.name)
		this.model.identifierBindings.set(expression, binding)
	}

	private resolveAssignmentTarget(target: IdentifierTargetNode): void {
		const binding = this.resolveName(target.name)
		this.model.assignmentTargetBindings.set(target, binding)
	}

	private resolveName(name: string): SemanticBinding {
		if (isBuiltinGlobalName(name)) {
			return {
				kind: 'builtin',
				name,
			}
		}
		for (let i = this.scopes.length - 1; i >= 0; i--) {
			const binding = this.scopes[i].bindings.get(name)
			if (binding !== undefined) {
				return binding
			}
		}
		throw new Error(`Неизвестная переменная: ${name}`)
	}

	private declare(name: string, binding: SemanticBinding): void {
		const currentScope = this.scopes[this.scopes.length - 1]
		if (currentScope === undefined) {
			throw new Error('Resolver: отсутствует текущий scope')
		}
		if (currentScope.bindings.has(name)) {
			throw new Error(`Повторное объявление переменной: ${name}`)
		}
		currentScope.bindings.set(name, binding)
	}

	private enterScope(): void {
		this.scopes.push({bindings: new Map()})
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
