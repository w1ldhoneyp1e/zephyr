import {type ExpressionNode, type StatementNode} from '../../ast'
import {type ClassRegistry} from '../ClassRegistry'
import {type SemanticBinding, type SemanticModel} from '../context'
import {
	type SemanticType,
	anyType,
	arrayType,
	classType,
	formatSemanticType,
	functionType,
	parseSemanticType,
	primitiveType,
	semanticTypesEqual,
} from '../SemanticType'

class TypeAnalyzer {
	constructor(
		private readonly model: SemanticModel,
		private readonly classRegistry: ClassRegistry,
	) {
	}

	inferExpressionType(expression: ExpressionNode): SemanticType {
		switch (expression.type) {
			case 'LiteralExpression':
				if (expression.value === null) {
					return primitiveType('null')
				}
				if (typeof expression.value === 'number') {
					return primitiveType('number')
				}
				if (typeof expression.value === 'string') {
					return primitiveType('string')
				}
				if (typeof expression.value === 'boolean') {
					return primitiveType('boolean')
				}
				return anyType()
			case 'IdentifierExpression': {
				const binding = this.model.identifierBindings.get(expression)
				return binding === undefined
					? anyType()
					: this.getBindingType(binding)
			}
			case 'UnaryExpression':
				return expression.operator === '!'
					? primitiveType('boolean')
					: primitiveType('number')
			case 'BinaryExpression':
				if (['==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(expression.operator)) {
					return primitiveType('boolean')
				}
				if (expression.operator === '??') {
					const leftType = this.inferExpressionType(expression.left)
					const rightType = this.inferExpressionType(expression.right)
					return leftType.kind === 'primitive' && leftType.name === 'null'
						? rightType
						: leftType
				}
				if (expression.operator === '+') {
					const leftType = this.inferExpressionType(expression.left)
					const rightType = this.inferExpressionType(expression.right)
					return (leftType.kind === 'primitive' && leftType.name === 'string')
						|| (rightType.kind === 'primitive' && rightType.name === 'string')
						? primitiveType('string')
						: primitiveType('number')
				}
				return primitiveType('number')
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
						return classType(binding.declaration.name)
					}
					if (binding?.kind === 'super') {
						return binding.selfBinding.type
					}
					if (binding?.kind === 'function') {
						return parseSemanticType(binding.declaration.returnTypeName)
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
				return anyType()
			case 'LambdaExpression':
				return functionType(
					expression.params.map(param => parseSemanticType(param.typeName)),
					expression.body.type === 'BlockStatement'
						? this.inferBlockReturnType(expression.body.statements)
						: this.inferExpressionType(expression.body),
				)
			default:
				return anyType()
		}
	}

	assertTypeAssignable(targetType: SemanticType, sourceType: SemanticType, context: string): void {
		if (
			targetType.kind === 'any'
			|| sourceType.kind === 'any'
			|| semanticTypesEqual(targetType, sourceType)
			|| this.classRegistry.isSubclassOf(sourceType, targetType)
		) {
			return
		}
		throw new Error(`Несовместимые типы в ${context}: ожидалось ${formatSemanticType(targetType)}, получено ${formatSemanticType(sourceType)}`)
	}

	getIndexedElementType(containerType: SemanticType): SemanticType {
		if (containerType.kind !== 'array') {
			return anyType()
		}
		return containerType.elementType
	}

	getBindingType(binding: SemanticBinding): SemanticType {
		return this.resolveBindingType(binding)
	}

	private resolveBindingType(binding: SemanticBinding): SemanticType {
		switch (binding.kind) {
			case 'variable':
				return parseSemanticType(binding.declaration.typeName)
			case 'class':
				return classType(binding.declaration.name)
			case 'function':
				return functionType(
					binding.declaration.params.map(param => parseSemanticType(param.typeName)),
					parseSemanticType(binding.declaration.returnTypeName),
				)
			case 'parameter':
				return binding.type
			case 'super':
				return classType(binding.baseClassBinding.declaration.name)
			case 'iterator':
			case 'builtin':
				return anyType()
		}
	}

	private inferArrayExpressionType(
		expression: Extract<ExpressionNode, {type: 'ArrayExpression'}>,
	): SemanticType {
		if (expression.elements.length === 0) {
			return arrayType(anyType())
		}

		const elementTypes = expression.elements.map(element => this.inferExpressionType(element))
		const firstType = elementTypes[0]
		for (const elementType of elementTypes) {
			if (!semanticTypesEqual(elementType, firstType)) {
				return arrayType(anyType())
			}
		}

		return arrayType(firstType)
	}

	private inferBlockReturnType(statements: StatementNode[]): SemanticType {
		const returnTypes = this.collectReturnTypes(statements)
		if (returnTypes.length === 0) {
			return anyType()
		}

		const firstType = returnTypes[0]
		for (const returnType of returnTypes) {
			if (!semanticTypesEqual(returnType, firstType)) {
				return anyType()
			}
		}

		return firstType
	}

	private collectReturnTypes(statements: StatementNode[]): SemanticType[] {
		const types: SemanticType[] = []
		for (const statement of statements) {
			switch (statement.type) {
				case 'ReturnStatement':
					types.push(statement.value === null
						? primitiveType('null')
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
