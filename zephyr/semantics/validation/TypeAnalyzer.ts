import {type ExpressionNode, type StatementNode} from '../../ast'
import {match} from '../../utils'
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
	unionType,
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
			case 'ChooseExpression':
				return this.inferCommonType([
					...expression.branches.map(branch => this.inferExpressionType(branch.value)),
					this.inferExpressionType(expression.defaultValue),
				])
			case 'CollectExpression':
				return arrayType(this.inferCommonType(
					expression.branches.map(branch => this.inferExpressionType(branch.value)),
				))
			case 'MatchExpression':
				return this.inferCommonType([
					...expression.branches.map(branch => this.inferExpressionType(branch.value)),
					this.inferExpressionType(expression.defaultValue),
				])
			case 'MatchByExpression':
				return this.inferCommonType([
					...expression.branches.map(branch => this.inferExpressionType(branch.value)),
					this.inferExpressionType(expression.defaultValue),
				])
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
		if (this.isTypeAssignable(targetType, sourceType)) {
			return
		}
		throw new Error(`Несовместимые типы в ${context}: ожидалось ${formatSemanticType(targetType)}, получено ${formatSemanticType(sourceType)}`)
	}

	isTypeAssignable(targetType: SemanticType, sourceType: SemanticType): boolean {
		if (targetType.kind === 'any' || sourceType.kind === 'any') {
			return true
		}
		if (sourceType.kind === 'union') {
			return sourceType.types.every(type => this.isTypeAssignable(targetType, type))
		}
		if (targetType.kind === 'union') {
			return targetType.types.some(type => this.isTypeAssignable(type, sourceType))
		}
		return semanticTypesEqual(targetType, sourceType)
			|| this.classRegistry.isSubclassOf(sourceType, targetType)
	}

	getIndexedElementType(containerType: SemanticType): SemanticType {
		if (containerType.kind !== 'array') {
			return anyType()
		}
		return containerType.elementType
	}

	getBindingType(binding: SemanticBinding): SemanticType {
		return match(binding, 'kind', {
			variable: value => parseSemanticType(value.declaration.typeName),
			class: value => classType(value.declaration.name),
			function: value => functionType(
				value.declaration.params.map(param => parseSemanticType(param.typeName)),
				parseSemanticType(value.declaration.returnTypeName),
			),
			narrowed: value => value.type,
			parameter: value => value.type,
			super: value => classType(value.baseClassBinding.declaration.name),
			iterator: anyType(),
			builtin: anyType(),
		})
	}

	private inferArrayExpressionType(
		expression: Extract<ExpressionNode, {type: 'ArrayExpression'}>,
	): SemanticType {
		return arrayType(this.inferCommonType(
			expression.elements.map(element => this.inferExpressionType(element)),
		))
	}

	private inferBlockReturnType(statements: StatementNode[]): SemanticType {
		return this.inferCommonType(this.collectReturnTypes(statements))
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

	private inferCommonType(types: SemanticType[]): SemanticType {
		if (types.length === 0) {
			return anyType()
		}

		const firstType = types[0]
		for (const type of types) {
			if (!semanticTypesEqual(type, firstType)) {
				return unionType(types)
			}
		}

		return firstType
	}
}

export {
	TypeAnalyzer,
}
