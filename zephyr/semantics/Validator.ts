import {
	type ClassFieldNode,
	type ExpressionNode,
	type ProgramNode,
	type StatementNode,
} from '../ast'
import {
	type CallableDeclarationNode,
	type SemanticBinding,
	type SemanticModel,
	isBindingMutable,
} from './context'

class Validator {
	validateProgram(program: ProgramNode, model: SemanticModel): ProgramNode {
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
					this.assertTypeAssignable(
						statement.typeName,
						this.inferExpressionType(statement.initializer, model),
						`инициализатор переменной ${statement.name}`,
					)
				}
				return
			case 'FunctionDeclaration':
				this.validateCallableBody(statement, model)
				return
			case 'ClassDeclaration':
				this.assertUniqueFieldNames(statement.fields)
				for (const method of statement.methods) {
					this.validateCallableBody(method, model)
				}
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
						this.assertTypeAssignable(
							owner.returnTypeName,
							this.inferExpressionType(statement.value, model),
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
						this.assertTypeAssignable(
							this.getBindingType(binding),
							this.inferExpressionType(statement.value, model),
							`присваивание ${statement.target.name}`,
						)
					}
				}
				else if (statement.target.type === 'IndexTarget') {
					this.validateExpression(statement.target.object, model)
					this.validateExpression(statement.target.index, model)
					this.assertTypeAssignable(
						'number',
						this.inferExpressionType(statement.target.index, model),
						'индекс массива',
					)
					this.assertTypeAssignable(
						this.getIndexedElementType(this.inferExpressionType(statement.target.object, model)),
						this.inferExpressionType(statement.value, model),
						'присваивание элемента массива',
					)
				}
				else {
					this.validateExpression(statement.target.object, model)
					const objectType = this.inferExpressionType(statement.target.object, model)
					const memberType = this.findClassFieldType(model, objectType, statement.target.property)
					this.assertTypeAssignable(
						memberType,
						this.inferExpressionType(statement.value, model),
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
				if ('index' in expression) {
					this.validateExpression(expression.index, model)
					this.assertTypeAssignable(
						'number',
						this.inferExpressionType(expression.index, model),
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
					model,
					`вызов функции ${binding.declaration.name}`,
				)
				return
			}
			if (binding?.kind === 'class') {
				this.validateCallArguments(
					expression.args,
					model.classConstructorParameterTypes.get(binding.declaration.name) ?? [],
					model,
					`создание класса ${binding.declaration.name}`,
				)
			}
			return
		}

		if (expression.callee.type === 'MemberExpression' || expression.callee.type === 'OptionalMemberExpression') {
			const objectType = this.inferExpressionType(expression.callee.object, model)
			this.validateCallArguments(
				expression.args,
				this.findClassMethodParameterTypes(model, objectType, expression.callee.property),
				model,
				`вызов метода ${expression.callee.property}`,
			)
		}
	}

	private validateCallArguments(
		args: ExpressionNode[],
		expectedTypes: string[],
		model: SemanticModel,
		context: string,
	): void {
		if (args.length !== expectedTypes.length) {
			throw new Error(`Неверное число аргументов в ${context}: ожидалось ${expectedTypes.length}, получено ${args.length}`)
		}

		for (const [index, arg] of args.entries()) {
			this.assertTypeAssignable(
				expectedTypes[index],
				this.inferExpressionType(arg, model),
				`${context}, аргумент ${index + 1}`,
			)
		}
	}

	private inferExpressionType(expression: ExpressionNode, model: SemanticModel): string {
		switch (expression.type) {
			case 'LiteralExpression':
				if (expression.value === null) {
					return 'null'
				}
				return typeof expression.value
			case 'IdentifierExpression': {
				const binding = model.identifierBindings.get(expression)
				return binding === undefined
					? 'any'
					: this.getBindingType(binding)
			}
			case 'UnaryExpression':
				return expression.operator === '!'
					? 'boolean'
					: 'number'
			case 'BinaryExpression':
				if (['==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(expression.operator)) {
					return 'boolean'
				}
				if (expression.operator === '??') {
					const leftType = this.inferExpressionType(expression.left, model)
					const rightType = this.inferExpressionType(expression.right, model)
					return leftType === 'null'
						? rightType
						: leftType
				}
				if (expression.operator === '+') {
					const leftType = this.inferExpressionType(expression.left, model)
					const rightType = this.inferExpressionType(expression.right, model)
					return leftType === 'string' || rightType === 'string'
						? 'string'
						: 'number'
				}
				return 'number'
			case 'ArrayExpression':
				return this.inferArrayExpressionType(expression, model)
			case 'IndexExpression':
			case 'OptionalIndexExpression':
				return this.getIndexedElementType(this.inferExpressionType(expression.object, model))
			case 'MemberExpression': {
				const objectType = this.inferExpressionType(expression.object, model)
				return this.findClassPropertyType(model, objectType, expression.property)
			}
			case 'OptionalMemberExpression': {
				const objectType = this.inferExpressionType(expression.object, model)
				return this.findClassPropertyType(model, objectType, expression.property)
			}
			case 'CallExpression':
				if (expression.callee.type === 'IdentifierExpression') {
					const binding = model.identifierBindings.get(expression.callee)
					if (binding?.kind === 'class') {
						return binding.declaration.name
					}
					if (binding?.kind === 'function') {
						return binding.declaration.returnTypeName
					}
				}
				if (expression.callee.type === 'MemberExpression') {
					const objectType = this.inferExpressionType(expression.callee.object, model)
					return this.findClassMethodReturnType(model, objectType, expression.callee.property)
				}
				if (expression.callee.type === 'OptionalMemberExpression') {
					const objectType = this.inferExpressionType(expression.callee.object, model)
					return this.findClassMethodReturnType(model, objectType, expression.callee.property)
				}
				return 'any'
			default:
				return 'any'
		}
	}

	private getBindingType(binding: SemanticBinding): string {
		switch (binding.kind) {
			case 'variable':
				return binding.declaration.typeName
			case 'class':
				return binding.declaration.name
			case 'function':
				return this.createCallableType(
					binding.declaration.params.map(param => param.typeName),
					binding.declaration.returnTypeName,
				)
			case 'parameter':
				return binding.typeName
			case 'iterator':
			case 'builtin':
				return 'any'
		}
	}

	private findClassFieldType(model: SemanticModel, className: string, property: string): string {
		if (className === 'any') {
			return 'any'
		}
		const fields = model.classFieldTypes.get(className)
		return fields?.get(property) ?? 'any'
	}

	private findClassPropertyType(model: SemanticModel, className: string, property: string): string {
		const fieldType = this.findClassFieldType(model, className, property)
		if (fieldType !== 'any') {
			return fieldType
		}
		return this.findClassMethodType(model, className, property)
	}

	private inferArrayExpressionType(
		expression: Extract<ExpressionNode, {type: 'ArrayExpression'}>,
		model: SemanticModel,
	): string {
		if (expression.elements.length === 0) {
			return 'any[]'
		}

		const elementTypes = expression.elements.map(element => this.inferExpressionType(element, model))
		const firstType = elementTypes[0]
		for (const elementType of elementTypes) {
			if (elementType !== firstType) {
				return 'any[]'
			}
		}

		return `${firstType}[]`
	}

	private getIndexedElementType(containerType: string): string {
		if (!containerType.endsWith('[]')) {
			return 'any'
		}
		return containerType.slice(0, -2)
	}

	private findClassMethodReturnType(model: SemanticModel, className: string, methodName: string): string {
		if (className === 'any') {
			return 'any'
		}
		const methods = model.classMethodReturnTypes.get(className)
		return methods?.get(methodName) ?? 'any'
	}

	private findClassMethodType(model: SemanticModel, className: string, methodName: string): string {
		if (className === 'any') {
			return 'any'
		}
		const returnType = this.findClassMethodReturnType(model, className, methodName)
		if (returnType === 'any') {
			return 'any'
		}
		return this.createCallableType(
			this.findClassMethodParameterTypes(model, className, methodName),
			returnType,
		)
	}

	private findClassMethodParameterTypes(model: SemanticModel, className: string, methodName: string): string[] {
		if (className === 'any') {
			return []
		}
		const methods = model.classMethodParameterTypes.get(className)
		return methods?.get(methodName) ?? []
	}

	private assertTypeAssignable(targetType: string, sourceType: string, context: string): void {
		if (targetType === 'any' || sourceType === 'any' || targetType === sourceType) {
			return
		}
		throw new Error(`Несовместимые типы в ${context}: ожидалось ${targetType}, получено ${sourceType}`)
	}

	private createCallableType(paramTypes: string[], returnType: string): string {
		return `fn(${paramTypes.join(', ')}): ${returnType}`
	}

	private assertUniqueFieldNames(fields: ClassFieldNode[]): void {
		const seen = new Set<string>()
		for (const field of fields) {
			if (seen.has(field.name)) {
				throw new Error(`Повторное объявление поля класса: ${field.name}`)
			}
			seen.add(field.name)
		}
	}

	private describeCallable(callable: CallableDeclarationNode): string {
		return callable.type === 'FunctionDeclaration'
			? `функции ${callable.name}`
			: `методе ${callable.name}`
	}
}

export {
	Validator,
}
