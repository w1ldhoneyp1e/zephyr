import {
	type ExpressionNode,
	type ForRangeStatementNode,
	type FunctionDeclarationNode,
	type IdentifierExpressionNode,
	type IdentifierTargetNode,
	type ProgramNode,
	type StatementNode,
	type VariableDeclarationNode,
} from '../ast'
import {isBuiltinGlobalName} from '../builtins'
import {
	type OwnedSemanticBinding,
	type SemanticBinding,
	type SemanticFunctionOwner,
	type SemanticModel,
} from './context'

class Resolver {
	private scopes: {
		bindings: Map<string, SemanticBinding>,
	}[] = []
	private functionOwners: SemanticFunctionOwner[] = []
	private captures = new Map<FunctionDeclarationNode, Set<SemanticBinding>>()
	private model: SemanticModel = {
		identifierBindings: new WeakMap(),
		assignmentTargetBindings: new WeakMap(),
		declarationBindings: new WeakMap(),
		functionParameterBindings: new WeakMap(),
		forRangeBindings: new WeakMap(),
		bindingFunctionOwners: new WeakMap(),
		functionCaptures: new WeakMap(),
	}

	resolveProgram(program: ProgramNode): {
		program: ProgramNode,
		model: SemanticModel,
	} {
		this.scopes = []
		this.functionOwners = [program]
		this.captures = new Map()
		this.model = {
			identifierBindings: new WeakMap(),
			assignmentTargetBindings: new WeakMap(),
			declarationBindings: new WeakMap(),
			functionParameterBindings: new WeakMap(),
			forRangeBindings: new WeakMap(),
			bindingFunctionOwners: new WeakMap(),
			functionCaptures: new WeakMap(),
		}
		this.enterScope()
		for (const statement of program.body) {
			this.resolveStatement(statement)
		}
		this.leaveScope()
		for (const [fn, captures] of this.captures.entries()) {
			this.model.functionCaptures.set(fn, [...captures])
		}

		return {
			program,
			model: this.model,
		}
	}

	private resolveStatement(statement: StatementNode): void {
		switch (statement.type) {
			case 'VariableDeclaration':
				this.declare(statement.name, this.createVariableBinding(statement))
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
				this.resolveForRangeStatement(statement)
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
		const binding = this.createFunctionBinding(statement)
		this.declare(statement.name, binding)
		this.captures.set(statement, new Set())
		this.enterFunction(statement)
		this.enterScope()
		const parameterBindings = statement.params.map((param, index) => {
			const parameterBinding: SemanticBinding = {
				kind: 'parameter',
				functionDeclaration: statement,
				index,
				name: param,
			}
			this.recordBindingOwner(parameterBinding)
			this.declare(param, parameterBinding)

			return parameterBinding
		})
		this.model.functionParameterBindings.set(statement, parameterBindings)
		for (const bodyStatement of statement.body.statements) {
			this.resolveStatement(bodyStatement)
		}
		this.leaveScope()
		this.leaveFunction(statement)
	}

	private resolveForRangeStatement(statement: ForRangeStatementNode): void {
		this.resolveExpression(statement.start)
		this.resolveExpression(statement.end)
		const binding = this.createIteratorBinding(statement)
		this.enterScope()
		this.declare(statement.iterator, binding)
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
		this.recordCapture(binding)
	}

	private resolveAssignmentTarget(target: IdentifierTargetNode): void {
		const binding = this.resolveName(target.name)
		this.model.assignmentTargetBindings.set(target, binding)
		this.recordCapture(binding)
	}

	private createVariableBinding(statement: VariableDeclarationNode): SemanticBinding {
		const binding: SemanticBinding = {
			kind: 'variable',
			declaration: statement,
		}
		this.model.declarationBindings.set(statement, binding)
		this.recordBindingOwner(binding)

		return binding
	}

	private createFunctionBinding(statement: FunctionDeclarationNode): SemanticBinding {
		const binding: SemanticBinding = {
			kind: 'function',
			declaration: statement,
		}
		this.model.declarationBindings.set(statement, binding)
		this.recordBindingOwner(binding)

		return binding
	}

	private createIteratorBinding(statement: ForRangeStatementNode): SemanticBinding {
		const binding: SemanticBinding = {
			kind: 'iterator',
			statement,
			name: statement.iterator,
		}
		this.model.forRangeBindings.set(statement, binding)
		this.recordBindingOwner(binding)

		return binding
	}

	private recordBindingOwner(binding: OwnedSemanticBinding): void {
		this.model.bindingFunctionOwners.set(binding, this.getCurrentFunctionOwner())
	}

	private recordCapture(binding: SemanticBinding): void {
		if (binding.kind === 'builtin') {
			return
		}
		const currentFunction = this.getCurrentFunction()
		if (currentFunction === null) {
			return
		}
		const bindingOwner = this.model.bindingFunctionOwners.get(binding)
		if (bindingOwner === undefined || bindingOwner === currentFunction) {
			return
		}
		const captures = this.captures.get(currentFunction)
		if (captures === undefined) {
			throw new Error('Resolver: capture set not initialized for function')
		}
		captures.add(binding)
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

	private enterFunction(statement: FunctionDeclarationNode): void {
		this.functionOwners.push(statement)
	}

	private leaveFunction(statement: FunctionDeclarationNode): void {
		const owner = this.functionOwners.pop()
		if (owner !== statement) {
			throw new Error('Resolver: неожиданный выход из функции')
		}
	}

	private getCurrentFunction(): FunctionDeclarationNode | null {
		const owner = this.getCurrentFunctionOwner()

		return owner.type === 'Program'
			? null
			: owner
	}

	private getCurrentFunctionOwner(): SemanticFunctionOwner {
		const owner = this.functionOwners[this.functionOwners.length - 1]
		if (owner === undefined) {
			throw new Error('Resolver: отсутствует текущий function owner')
		}

		return owner
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
