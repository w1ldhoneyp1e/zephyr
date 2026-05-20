import {type ExpressionNode, type StatementNode} from '../../ast'
import {type ClassRegistry} from '../ClassRegistry'
import {type SemanticBinding, type SemanticModel} from '../context'

class TypeAnalyzer {
	constructor(
		private readonly model: SemanticModel,
		private readonly classRegistry: ClassRegistry,
	) {
	}

	inferExpressionType(expression: ExpressionNode): string {
		switch (expression.type) {
			case 'LiteralExpression':
				if (expression.value === null) {
					return 'null'
				}
				return typeof expression.value
			case 'IdentifierExpression': {
				const binding = this.model.identifierBindings.get(expression)
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
					const leftType = this.inferExpressionType(expression.left)
					const rightType = this.inferExpressionType(expression.right)
					return leftType === 'null'
						? rightType
						: leftType
				}
				if (expression.operator === '+') {
					const leftType = this.inferExpressionType(expression.left)
					const rightType = this.inferExpressionType(expression.right)
					return leftType === 'string' || rightType === 'string'
						? 'string'
						: 'number'
				}
				return 'number'
			case 'ArrayExpression':
				return this.inferArrayExpressionType(expression)
			case 'IndexExpression':
			case 'OptionalIndexExpression':
				return this.getIndexedElementType(this.inferExpressionType(expression.object))
			case 'MemberExpression': {
				const objectType = this.inferExpressionType(expression.object)
				return this.classRegistry.getPropertyType(objectType, expression.property)
			}
			case 'OptionalMemberExpression': {
				const objectType = this.inferExpressionType(expression.object)
				return this.classRegistry.getPropertyType(objectType, expression.property)
			}
			case 'CallExpression':
				if (expression.callee.type === 'IdentifierExpression') {
					const binding = this.model.identifierBindings.get(expression.callee)
					if (binding?.kind === 'class') {
						return binding.declaration.name
					}
					if (binding?.kind === 'super') {
						return binding.selfBinding.typeName
					}
					if (binding?.kind === 'function') {
						return binding.declaration.returnTypeName
					}
				}
				if (expression.callee.type === 'MemberExpression') {
					const objectType = this.inferExpressionType(expression.callee.object)
					return this.classRegistry.getMethodReturnType(objectType, expression.callee.property)
				}
				if (expression.callee.type === 'OptionalMemberExpression') {
					const objectType = this.inferExpressionType(expression.callee.object)
					return this.classRegistry.getMethodReturnType(objectType, expression.callee.property)
				}
				return 'any'
			case 'LambdaExpression':
				return this.createCallableType(
					expression.params.map(param => param.typeName),
					expression.body.type === 'BlockStatement'
						? this.inferBlockReturnType(expression.body.statements)
						: this.inferExpressionType(expression.body),
				)
			default:
				return 'any'
		}
	}

	assertTypeAssignable(targetType: string, sourceType: string, context: string): void {
		if (
			targetType === 'any'
			|| sourceType === 'any'
			|| targetType === sourceType
			|| this.classRegistry.isSubclassOf(sourceType, targetType)
		) {
			return
		}
		throw new Error(`Несовместимые типы в ${context}: ожидалось ${targetType}, получено ${sourceType}`)
	}

	getIndexedElementType(containerType: string): string {
		if (!containerType.endsWith('[]')) {
			return 'any'
		}
		return containerType.slice(0, -2)
	}

	createCallableType(paramTypes: string[], returnType: string): string {
		return `(${paramTypes.join(', ')}) => ${returnType}`
	}

	getBindingType(binding: SemanticBinding): string {
		return this.resolveBindingType(binding)
	}

	private resolveBindingType(binding: SemanticBinding): string {
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
			case 'super':
				return binding.baseClassBinding.declaration.name
			case 'iterator':
			case 'builtin':
				return 'any'
		}
	}

	private inferArrayExpressionType(
		expression: Extract<ExpressionNode, {type: 'ArrayExpression'}>,
	): string {
		if (expression.elements.length === 0) {
			return 'any[]'
		}

		const elementTypes = expression.elements.map(element => this.inferExpressionType(element))
		const firstType = elementTypes[0]
		for (const elementType of elementTypes) {
			if (elementType !== firstType) {
				return 'any[]'
			}
		}

		return `${firstType}[]`
	}

	private inferBlockReturnType(statements: StatementNode[]): string {
		const returnTypes = this.collectReturnTypes(statements)
		if (returnTypes.length === 0) {
			return 'any'
		}

		const firstType = returnTypes[0]
		for (const returnType of returnTypes) {
			if (returnType !== firstType) {
				return 'any'
			}
		}

		return firstType
	}

	private collectReturnTypes(statements: StatementNode[]): string[] {
		const types: string[] = []
		for (const statement of statements) {
			switch (statement.type) {
				case 'ReturnStatement':
					types.push(statement.value === null
						? 'null'
						: this.inferExpressionType(statement.value))
					break
				case 'BlockStatement':
					types.push(...this.collectReturnTypes(statement.statements))
					break
				case 'IfStatement':
					types.push(...this.collectReturnTypes(statement.thenBranch.statements))
					if (statement.elseBranch !== null) {
						types.push(...this.collectReturnTypes(statement.elseBranch.statements))
					}
					break
				case 'WhileStatement':
				case 'ForRangeStatement':
					types.push(...this.collectReturnTypes(statement.body.statements))
					break
				default:
					break
			}
		}

		return types
	}
}

export {
	TypeAnalyzer,
}
