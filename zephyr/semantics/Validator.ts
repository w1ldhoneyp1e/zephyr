import {
	type ClassDeclarationNode,
	type ExpressionNode,
	type ProgramNode,
	type StatementNode,
} from '../ast'
import {ClassRegistry} from './ClassRegistry'
import {
	type CallableDeclarationNode,
	type SemanticModel,
	isBindingMutable,
} from './context'
import {ClassValidator} from './validation/ClassValidator'
import {TypeAnalyzer} from './validation/TypeAnalyzer'

class Validator {
	private currentClassStack: string[] = []
	private classRegistry: ClassRegistry | null = null
	private typeAnalyzer: TypeAnalyzer | null = null
	private classValidator: ClassValidator | null = null

	validateProgram(program: ProgramNode, model: SemanticModel): ProgramNode {
		this.classRegistry = new ClassRegistry(model)
		this.typeAnalyzer = new TypeAnalyzer(model, this.classRegistry)
		this.classValidator = new ClassValidator(
			model,
			this.classRegistry,
			() => this.getCurrentClassName(),
		)
		for (const statement of program.body) {
			this.validateStatement(statement, model)
		}

		return program
	}

	private validateStatement(statement: StatementNode, model: SemanticModel): void {
		switch (statement.type) {
			case 'VariableDeclaration':
				if (statement.initializer !== null) {
					this.validateExpression(statement.initializer, model)
					this.getTypeAnalyzer().assertTypeAssignable(
						statement.typeName,
						this.getTypeAnalyzer().inferExpressionType(statement.initializer),
						`инициализатор переменной ${statement.name}`,
					)
				}
				return
			case 'FunctionDeclaration':
				this.validateCallableBody(statement, model)
				return
			case 'ClassDeclaration':
				this.getClassValidator().assertValidBaseClass(statement)
				this.getClassValidator().assertNoInheritanceCycle(statement.name)
				this.getClassValidator().assertUniqueFieldNames(statement.fields)
				this.getClassValidator().assertUniqueMethodNames(statement)
				this.getClassValidator().assertNoMemberNameConflicts(statement)
				this.currentClassStack.push(statement.name)
				if (statement.constructorDeclaration !== null) {
					this.validateCallableBody(statement.constructorDeclaration, model)
				}
				for (const method of statement.methods) {
					this.validateCallableBody(method, model)
				}
				this.currentClassStack.pop()
				return
			case 'IfStatement':
				this.validateExpression(statement.condition, model)
				for (const bodyStatement of statement.thenBranch.statements) {
					this.validateStatement(bodyStatement, model)
				}
				if (statement.elseBranch !== null) {
					for (const bodyStatement of statement.elseBranch.statements) {
						this.validateStatement(bodyStatement, model)
					}
				}
				return
			case 'WhileStatement':
				this.validateExpression(statement.condition, model)
				for (const bodyStatement of statement.body.statements) {
					this.validateStatement(bodyStatement, model)
				}
				return
			case 'ForRangeStatement':
				this.validateExpression(statement.start, model)
				this.validateExpression(statement.end, model)
				for (const bodyStatement of statement.body.statements) {
					this.validateStatement(bodyStatement, model)
				}
				return
			case 'ReturnStatement':
				if (statement.value !== null) {
					this.validateExpression(statement.value, model)
					const owner = model.returnOwners.get(statement)
					if (owner !== undefined && owner !== null) {
						if (owner.type === 'ConstructorDeclaration') {
							throw new Error('Нельзя использовать return внутри constructor')
						}
						if (owner.type === 'LambdaExpression') {
							return
						}
						this.getTypeAnalyzer().assertTypeAssignable(
							owner.returnTypeName,
							this.getTypeAnalyzer().inferExpressionType(statement.value),
							`return в ${this.describeCallable(owner)}`,
						)
					}
				}
				return
			case 'BreakStatement':
				if (model.statementLoopOwners.get(statement) === null) {
					throw new Error('Нельзя использовать break вне цикла')
				}
				return
			case 'ContinueStatement':
				if (model.statementLoopOwners.get(statement) === null) {
					throw new Error('Нельзя использовать continue вне цикла')
				}
				return
			case 'BlockStatement':
				for (const bodyStatement of statement.statements) {
					this.validateStatement(bodyStatement, model)
				}
				return
			case 'ExpressionStatement':
				this.validateExpression(statement.expression, model)
				return
			case 'AssignmentStatement':
				if (statement.target.type === 'IdentifierTarget') {
					const binding = model.assignmentTargetBindings.get(statement.target)
					if (binding !== undefined && !isBindingMutable(binding)) {
						throw new Error(`Нельзя присвоить значение имени: ${statement.target.name}`)
					}
					if (binding !== undefined) {
						this.getTypeAnalyzer().assertTypeAssignable(
							this.getTypeAnalyzer().getBindingType(binding),
							this.getTypeAnalyzer().inferExpressionType(statement.value),
							`присваивание ${statement.target.name}`,
						)
					}
				}
				else if (statement.target.type === 'IndexTarget') {
					this.validateExpression(statement.target.object, model)
					this.validateExpression(statement.target.index, model)
					this.getTypeAnalyzer().assertTypeAssignable(
						'number',
						this.getTypeAnalyzer().inferExpressionType(statement.target.index),
						'индекс массива',
					)
					this.getTypeAnalyzer().assertTypeAssignable(
						this.getTypeAnalyzer().getIndexedElementType(this.getTypeAnalyzer().inferExpressionType(statement.target.object)),
						this.getTypeAnalyzer().inferExpressionType(statement.value),
						'присваивание элемента массива',
					)
				}
				else {
					this.validateExpression(statement.target.object, model)
					const objectType = this.getTypeAnalyzer().inferExpressionType(statement.target.object)
					this.getClassValidator().assertClassMemberAccessible(objectType, statement.target.property, 'field')
					const memberType = this.getClassRegistry().getFieldType(objectType, statement.target.property)
					this.getTypeAnalyzer().assertTypeAssignable(
						memberType,
						this.getTypeAnalyzer().inferExpressionType(statement.value),
						`присваивание свойства ${statement.target.property}`,
					)
				}
				this.validateExpression(statement.value, model)
				return
			default:
				throw new Error(`Validator: неподдерживаемый statement: ${(statement as {type: string}).type}`)
		}
	}

	private validateCallableBody(callable: CallableDeclarationNode, model: SemanticModel): void {
		if (callable.type === 'LambdaExpression') {
			if (callable.body.type === 'BlockStatement') {
				for (const bodyStatement of callable.body.statements) {
					this.validateStatement(bodyStatement, model)
				}
			}
			else {
				this.validateExpression(callable.body, model)
			}
			return
		}
		for (const bodyStatement of callable.body.statements) {
			this.validateStatement(bodyStatement, model)
		}
	}

	private validateExpression(expression: ExpressionNode, model: SemanticModel): void {
		switch (expression.type) {
			case 'LiteralExpression':
			case 'IdentifierExpression':
				return
			case 'UnaryExpression':
				this.validateExpression(expression.argument, model)
				return
			case 'BinaryExpression':
				this.validateExpression(expression.left, model)
				this.validateExpression(expression.right, model)
				return
			case 'ArrayExpression':
				for (const element of expression.elements) {
					this.validateExpression(element, model)
				}
				return
			case 'IndexExpression':
			case 'OptionalIndexExpression':
			case 'MemberExpression':
			case 'OptionalMemberExpression':
				this.validateExpression(expression.object, model)
				if ('property' in expression) {
					this.getClassValidator().assertClassMemberAccessible(
						this.getTypeAnalyzer().inferExpressionType(expression.object),
						expression.property,
					)
				}
				if ('index' in expression) {
					this.validateExpression(expression.index, model)
					this.getTypeAnalyzer().assertTypeAssignable(
						'number',
						this.getTypeAnalyzer().inferExpressionType(expression.index),
						'индекс массива',
					)
				}
				return
			case 'CallExpression':
				this.validateExpression(expression.callee, model)
				for (const arg of expression.args) {
					this.validateExpression(arg, model)
				}
				this.validateCallExpression(expression, model)
				return
			case 'LambdaExpression':
				this.validateCallableBody(expression, model)
				return
			default:
				throw new Error(`Validator: неподдерживаемое выражение: ${(expression as {type: string}).type}`)
		}
	}

	private validateCallExpression(expression: Extract<ExpressionNode, {type: 'CallExpression'}>, model: SemanticModel): void {
		if (expression.callee.type === 'IdentifierExpression') {
			const binding = model.identifierBindings.get(expression.callee)
			if (binding?.kind === 'function') {
				this.validateCallArguments(
					expression.args,
					binding.declaration.params.map(param => param.typeName),
					`вызов функции ${binding.declaration.name}`,
				)
				return
			}
			if (binding?.kind === 'class') {
				this.validateCallArguments(
					expression.args,
					this.getClassRegistry().getConstructorParameterTypes(binding.declaration.name),
					`создание класса ${binding.declaration.name}`,
				)
				return
			}
			if (binding?.kind === 'super') {
				this.validateCallArguments(
					expression.args,
					this.getClassRegistry().getConstructorParameterTypes(binding.baseClassBinding.declaration.name),
					`вызов super для ${binding.baseClassBinding.declaration.name}`,
				)
			}
			return
		}

		if (expression.callee.type === 'MemberExpression' || expression.callee.type === 'OptionalMemberExpression') {
			const objectType = this.getTypeAnalyzer().inferExpressionType(expression.callee.object)
			this.validateCallArguments(
				expression.args,
				this.getClassRegistry().getMethodParameterTypes(objectType, expression.callee.property),
				`вызов метода ${expression.callee.property}`,
			)
		}
	}

	private validateCallArguments(
		args: ExpressionNode[],
		expectedTypes: string[],
		context: string,
	): void {
		if (args.length !== expectedTypes.length) {
			throw new Error(`Неверное число аргументов в ${context}: ожидалось ${expectedTypes.length}, получено ${args.length}`)
		}

		for (const [index, arg] of args.entries()) {
			this.getTypeAnalyzer().assertTypeAssignable(
				expectedTypes[index],
				this.getTypeAnalyzer().inferExpressionType(arg),
				`${context}, аргумент ${index + 1}`,
			)
		}
	}

	private getCurrentClassName(): string | null {
		return this.currentClassStack.length === 0
			? null
			: this.currentClassStack[this.currentClassStack.length - 1]
	}

	private getClassRegistry(): ClassRegistry {
		if (this.classRegistry === null) {
			throw new Error('ClassRegistry не инициализирован')
		}

		return this.classRegistry
	}

	private getTypeAnalyzer(): TypeAnalyzer {
		if (this.typeAnalyzer === null) {
			throw new Error('TypeAnalyzer не инициализирован')
		}

		return this.typeAnalyzer
	}

	private getClassValidator(): ClassValidator {
		if (this.classValidator === null) {
			throw new Error('ClassValidator не инициализирован')
		}

		return this.classValidator
	}

	private describeCallable(callable: CallableDeclarationNode): string {
		if (callable.type === 'FunctionDeclaration') {
			return `функции ${callable.name}`
		}
		if (callable.type === 'MethodDeclaration') {
			return `методе ${callable.name}`
		}
		if (callable.type === 'ConstructorDeclaration') {
			return 'constructor'
		}
		return 'лямбде'
	}
}

export {
	Validator,
}
