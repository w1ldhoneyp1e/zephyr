import {
	type ClassDeclarationNode,
	type ExpressionNode,
	type ForRangeStatementNode,
	type FunctionDeclarationNode,
	type IdentifierExpressionNode,
	type IdentifierTargetNode,
	type MethodDeclarationNode,
	type ProgramNode,
	type StatementNode,
	type VariableDeclarationNode,
} from '../ast'
import {isBuiltinGlobalName} from '../builtins'
import {
	type CallableDeclarationNode,
	type OwnedSemanticBinding,
	type SemanticBinding,
	type SemanticFunctionOwner,
	type SemanticLoopOwner,
	type SemanticModel,
} from './context'

class Resolver {
	private scopes: {
		bindings: Map<string, SemanticBinding>,
	}[] = []
	private functionOwners: SemanticFunctionOwner[] = []
	private loopOwners: SemanticLoopOwner[] = []
	private functionLoopSnapshots: SemanticLoopOwner[][] = []
	private captures = new Map<CallableDeclarationNode, Set<SemanticBinding>>()
	private model: SemanticModel = {
		identifierBindings: new WeakMap(),
		assignmentTargetBindings: new WeakMap(),
		statementLoopOwners: new WeakMap(),
		declarationBindings: new WeakMap(),
		functionParameterBindings: new WeakMap(),
		forRangeBindings: new WeakMap(),
		returnOwners: new WeakMap(),
		bindingFunctionOwners: new WeakMap(),
		callableCaptures: new WeakMap(),
		methodReceiverBindings: new WeakMap(),
		classFieldTypes: new Map(),
		classConstructorParameterTypes: new Map(),
		classMethodReturnTypes: new Map(),
		classMethodParameterTypes: new Map(),
	}

	resolveProgram(program: ProgramNode): {
		program: ProgramNode,
		model: SemanticModel,
	} {
		this.scopes = []
		this.functionOwners = [program]
		this.loopOwners = []
		this.functionLoopSnapshots = []
		this.captures = new Map()
		this.model = {
			identifierBindings: new WeakMap(),
			assignmentTargetBindings: new WeakMap(),
			statementLoopOwners: new WeakMap(),
			declarationBindings: new WeakMap(),
			functionParameterBindings: new WeakMap(),
			forRangeBindings: new WeakMap(),
			returnOwners: new WeakMap(),
			bindingFunctionOwners: new WeakMap(),
			callableCaptures: new WeakMap(),
			methodReceiverBindings: new WeakMap(),
			classFieldTypes: new Map(),
			classConstructorParameterTypes: new Map(),
			classMethodReturnTypes: new Map(),
			classMethodParameterTypes: new Map(),
		}
		this.enterScope()
		for (const statement of program.body) {
			this.resolveStatement(statement)
		}
		this.leaveScope()
		for (const [fn, captures] of this.captures.entries()) {
			this.model.callableCaptures.set(fn, [...captures])
		}

		return {
			program,
			model: this.model,
		}
	}

	private resolveStatement(statement: StatementNode): void {
		this.model.statementLoopOwners.set(statement, this.getCurrentLoop())
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
			case 'ClassDeclaration':
				this.resolveClassDeclaration(statement)
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
				this.enterLoop(statement)
				this.resolveBlock(statement.body.statements)
				this.leaveLoop(statement)
				return
			case 'ForRangeStatement':
				this.resolveForRangeStatement(statement)
				return
			case 'ReturnStatement':
				this.model.returnOwners.set(statement, this.getCurrentFunction())
				if (statement.value !== null) {
					this.resolveExpression(statement.value)
				}
				return
			case 'BreakStatement':
			case 'ContinueStatement':
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
				else if (statement.target.type === 'IndexTarget') {
					this.resolveExpression(statement.target.object)
					this.resolveExpression(statement.target.index)
				}
				else {
					this.resolveExpression(statement.target.object)
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
		this.resolveCallableDeclaration(statement)
	}

	private resolveClassDeclaration(statement: ClassDeclarationNode): void {
		const binding = this.createClassBinding(statement)
		this.declare(statement.name, binding)
		this.model.classFieldTypes.set(
			statement.name,
			new Map(statement.fields.map(field => [field.name, field.typeName])),
		)
		this.model.classConstructorParameterTypes.set(
			statement.name,
			statement.fields.map(field => field.typeName),
		)
		this.model.classMethodReturnTypes.set(
			statement.name,
			new Map(statement.methods.map(method => [method.name, method.returnTypeName])),
		)
		this.model.classMethodParameterTypes.set(
			statement.name,
			new Map(statement.methods.map(method => [
				method.name,
				method.params.map(param => param.typeName),
			])),
		)
		for (const method of statement.methods) {
			this.resolveMethodDeclaration(method, binding)
		}
	}

	private resolveMethodDeclaration(
		statement: MethodDeclarationNode,
		receiverBinding: SemanticBinding,
	): void {
		if (receiverBinding.kind !== 'class') {
			throw new Error(`Метод ${statement.name} должен принадлежать классу`)
		}
		this.model.methodReceiverBindings.set(statement, receiverBinding)
		this.resolveCallableDeclaration(statement, receiverBinding.declaration.name)
	}

	private resolveCallableDeclaration(
		statement: CallableDeclarationNode,
		selfName?: string,
	): void {
		this.captures.set(statement, new Set())
		this.enterFunction(statement)
		this.enterScope()
		const parameterBindings: SemanticBinding[] = []
		if (selfName !== undefined) {
			const selfBinding: SemanticBinding = {
				kind: 'parameter',
				callableDeclaration: statement,
				index: 0,
				name: 'self',
				typeName: selfName,
			}
			this.recordBindingOwner(selfBinding)
			this.declare('self', selfBinding)
			parameterBindings.push(selfBinding)
		}
		for (const [index, param] of statement.params.entries()) {
			const parameterBinding: SemanticBinding = {
				kind: 'parameter',
				callableDeclaration: statement,
				index: index + parameterBindings.length,
				name: param.name,
				typeName: param.typeName,
			}
			this.recordBindingOwner(parameterBinding)
			this.declare(param.name, parameterBinding)
			parameterBindings.push(parameterBinding)
		}
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
		this.enterLoop(statement)
		this.enterScope()
		this.declare(statement.iterator, binding)
		for (const bodyStatement of statement.body.statements) {
			this.resolveStatement(bodyStatement)
		}
		this.leaveScope()
		this.leaveLoop(statement)
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
			case 'OptionalIndexExpression':
			case 'MemberExpression':
			case 'OptionalMemberExpression':
				this.resolveExpression(expression.object)
				if ('index' in expression) {
					this.resolveExpression(expression.index)
				}
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

	private createClassBinding(statement: ClassDeclarationNode): SemanticBinding {
		const binding: SemanticBinding = {
			kind: 'class',
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

	private enterFunction(statement: CallableDeclarationNode): void {
		this.functionLoopSnapshots.push([...this.loopOwners])
		this.loopOwners = []
		this.functionOwners.push(statement)
	}

	private leaveFunction(statement: CallableDeclarationNode): void {
		const owner = this.functionOwners.pop()
		if (owner !== statement) {
			throw new Error('Resolver: неожиданный выход из функции')
		}
		const loopSnapshot = this.functionLoopSnapshots.pop()
		if (loopSnapshot === undefined) {
			throw new Error('Resolver: отсутствует snapshot loop-контекста функции')
		}
		this.loopOwners = loopSnapshot
	}

	private getCurrentFunction(): CallableDeclarationNode | null {
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

	private enterLoop(statement: SemanticLoopOwner): void {
		this.loopOwners.push(statement)
	}

	private leaveLoop(statement: SemanticLoopOwner): void {
		const owner = this.loopOwners.pop()
		if (owner !== statement) {
			throw new Error('Resolver: неожиданный выход из loop-контекста')
		}
	}

	private getCurrentLoop(): SemanticLoopOwner | null {
		const currentLoop = this.loopOwners[this.loopOwners.length - 1]

		return currentLoop ?? null
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
