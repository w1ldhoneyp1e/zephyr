import {
	type ExpressionNode,
	type FunctionDeclarationNode,
	type ParameterNode,
	type StatementNode,
	type TypeName,
	typeNameToString,
} from '../../ast'
import {type DiagnosticReporter, type NodeLocations} from '../../diagnostics'
import {match} from '../../utils'
import {type ClassRegistry} from '../ClassRegistry'
import {type SemanticBinding, type SemanticModel} from '../context'
import {
	type SemanticType,
	anyType,
	arrayType,
	classType,
	errorType,
	formatSemanticType,
	functionType,
	hasNullType,
	parseSemanticType,
	primitiveType,
	removeNullFromType,
	semanticTypesEqual,
	typeParameterType,
	unionType,
} from '../SemanticType'
import {getTypeErrorLocation} from '../TypeDiagnostics'

class TypeAnalyzer {
	private readonly contextualParameterTypes = new WeakMap<SemanticBinding, SemanticType>()

	constructor(
		private readonly model: SemanticModel,
		private readonly classRegistry: ClassRegistry,
		private readonly reporter: DiagnosticReporter,
		private readonly nodeLocations: NodeLocations,
	) {
	}

	inferExpressionType(expression: ExpressionNode, expectedType: SemanticType | null = null): SemanticType {
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
						: hasNullType(leftType)
							? unionType([removeNullFromType(leftType), rightType])
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
				return this.inferArrayExpressionType(expression, expectedType)
			case 'ChooseExpression':
				return this.inferCommonType([
					...expression.branches.map(branch => this.inferExpressionType(branch.value, expectedType)),
					this.inferExpressionType(expression.defaultValue, expectedType),
				])
			case 'CollectExpression':
				return arrayType(this.inferCommonType(
					expression.branches.map(branch => this.inferExpressionType(branch.value)),
				))
			case 'MatchExpression':
				return this.inferCommonType(this.inferMatchResultTypes(expression, expectedType))
			case 'MatchByExpression':
				return this.inferCommonType(this.inferMatchResultTypes(expression, expectedType))
			case 'IndexExpression':
				return this.getIndexedElementType(this.inferExpressionType(expression.object))
			case 'OptionalIndexExpression':
				return unionType([
					this.getIndexedElementType(removeNullFromType(this.inferExpressionType(expression.object))),
					primitiveType('null'),
				])
			case 'MemberExpression': {
				const objectType = this.inferExpressionType(expression.object)
				return this.classRegistry.getPropertyType(objectType, expression.property)
			}
			case 'OptionalMemberExpression': {
				const objectType = removeNullFromType(this.inferExpressionType(expression.object))
				return unionType([
					this.classRegistry.getPropertyType(objectType, expression.property),
					primitiveType('null'),
				])
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
						return this.inferFunctionCallReturnType(binding.declaration, expression.args)
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
				return this.inferLambdaExpressionType(expression, expectedType)
			default:
				return anyType()
		}
	}

	assertTypeAssignable(targetType: SemanticType, sourceType: SemanticType, context: string): void {
		if (targetType.kind === 'error' || sourceType.kind === 'error') {
			return
		}
		if (this.isTypeAssignable(targetType, sourceType)) {
			return
		}
		throw new Error(
			`Несовместимые типы в ${context}: ожидалось ${formatSemanticType(targetType)}, получено ${formatSemanticType(sourceType)}${this.describeTypeMismatch(targetType, sourceType)}`,
		)
	}

	assertExpressionAssignable(targetType: SemanticType, expression: ExpressionNode, context: string): void {
		this.assertTypeAssignable(targetType, this.inferExpressionType(expression, targetType), context)
	}

	resolveTypeName(
		typeName: TypeName,
		typeParams: string[] = [],
		node?: StatementNode | ExpressionNode | ParameterNode,
	): SemanticType {
		try {
			return parseSemanticType(
				typeNameToString(typeName),
				name => typeParams.includes(name)
					? typeParameterType(name)
					: this.model.typeAliases.get(name) ?? null,
				name =>
					typeParams.includes(name)
					|| this.model.classNames.has(name)
					|| this.model.typeAliasNames.has(name),
			)
		}
		catch (error) {
			this.reporter.reportError(error, getTypeErrorLocation(typeName, node, this.nodeLocations, error))

			return errorType()
		}
	}

	getFunctionParameterTypes(declaration: FunctionDeclarationNode, args: ExpressionNode[]): SemanticType[] {
		const substitutions = this.inferTypeParameterSubstitutions(declaration, args)
		return declaration.params.map(param =>
			this.substituteTypeParameters(
				this.resolveTypeName(
					param.typeName,
					declaration.typeParams,
					param,
				),
				substitutions,
			),
		)
	}

	isTypeAssignable(targetType: SemanticType, sourceType: SemanticType): boolean {
		if (targetType.kind === 'error' || sourceType.kind === 'error') {
			return true
		}
		if (targetType.kind === 'any' || sourceType.kind === 'any') {
			return true
		}
		if (sourceType.kind === 'union') {
			return sourceType.types.every(type => this.isTypeAssignable(targetType, type))
		}
		if (targetType.kind === 'union') {
			return targetType.types.some(type => this.isTypeAssignable(type, sourceType))
		}
		if (targetType.kind === 'object') {
			return this.isObjectTypeAssignable(targetType, sourceType)
		}
		return semanticTypesEqual(targetType, sourceType)
			|| this.classRegistry.isSubclassOf(sourceType, targetType)
	}

	private isObjectTypeAssignable(targetType: Extract<SemanticType, {kind: 'object'}>, sourceType: SemanticType): boolean {
		for (const [propertyName, propertyType] of targetType.properties.entries()) {
			const sourcePropertyType = this.classRegistry.getPropertyType(sourceType, propertyName)
			if (sourcePropertyType.kind === 'any' || !this.isTypeAssignable(propertyType, sourcePropertyType)) {
				return false
			}
		}
		return true
	}

	private describeTypeMismatch(targetType: SemanticType, sourceType: SemanticType): string {
		if (targetType.kind !== 'object') {
			return ''
		}
		for (const [propertyName, propertyType] of targetType.properties.entries()) {
			const sourcePropertyType = this.classRegistry.getPropertyType(sourceType, propertyName)
			if (sourcePropertyType.kind === 'any') {
				return `; отсутствует член ${propertyName}`
			}
			if (!this.isTypeAssignable(propertyType, sourcePropertyType)) {
				return `; член ${propertyName}: ожидалось ${formatSemanticType(propertyType)}, получено ${formatSemanticType(sourcePropertyType)}`
			}
		}
		return ''
	}

	getIndexedElementType(containerType: SemanticType): SemanticType {
		if (containerType.kind === 'error') {
			return errorType()
		}
		if (containerType.kind !== 'array') {
			return anyType()
		}
		return containerType.elementType
	}

	getBindingType(binding: SemanticBinding): SemanticType {
		return match(binding, 'kind', {
			variable: value => this.resolveTypeName(value.declaration.typeName),
			class: value => classType(value.declaration.name),
			function: value => functionType(
				value.declaration.params.map(param =>
					this.resolveTypeName(param.typeName, value.declaration.typeParams, param),
				),
				this.resolveTypeName(value.declaration.returnTypeName, value.declaration.typeParams),
			),
			narrowed: value => value.type,
			parameter: value => this.contextualParameterTypes.get(value) ?? value.type,
			super: value => classType(value.baseClassBinding.declaration.name),
			iterator: anyType(),
			builtin: anyType(),
			error: errorType(),
		})
	}

	private inferArrayExpressionType(
		expression: Extract<ExpressionNode, {type: 'ArrayExpression'}>,
		expectedType: SemanticType | null,
	): SemanticType {
		if (expectedType?.kind === 'array') {
			return arrayType(this.inferCommonType(
				expression.elements.map(element => this.inferExpressionType(element, expectedType.elementType)),
			))
		}
		return arrayType(this.inferCommonType(expression.elements.map(element => this.inferExpressionType(element))))
	}

	private inferMatchResultTypes(
		expression: Extract<ExpressionNode, {type: 'MatchExpression' | 'MatchByExpression'}>,
		expectedType: SemanticType | null,
	): SemanticType[] {
		return expression.defaultValue === null
			? expression.branches.map(branch => this.inferExpressionType(branch.value, expectedType))
			: [
				...expression.branches.map(branch => this.inferExpressionType(branch.value, expectedType)),
				this.inferExpressionType(expression.defaultValue, expectedType),
			]
	}

	private inferFunctionCallReturnType(declaration: FunctionDeclarationNode, args: ExpressionNode[]): SemanticType {
		const substitutions = this.inferTypeParameterSubstitutions(declaration, args)
		return this.substituteTypeParameters(
			this.resolveTypeName(declaration.returnTypeName, declaration.typeParams),
			substitutions,
		)
	}

	private inferTypeParameterSubstitutions(
		declaration: FunctionDeclarationNode,
		args: ExpressionNode[],
	): Map<string, SemanticType> {
		const substitutions = new Map<string, SemanticType>()
		for (const [index, param] of declaration.params.entries()) {
			const arg = args[index]
			if (arg !== undefined) {
				this.collectTypeParameterSubstitutions(
					this.resolveTypeName(param.typeName, declaration.typeParams, param),
					this.inferExpressionType(arg),
					substitutions,
				)
			}
		}
		return substitutions
	}

	private collectTypeParameterSubstitutions(
		expectedType: SemanticType,
		actualType: SemanticType,
		substitutions: Map<string, SemanticType>,
	): void {
		if (expectedType.kind === 'typeParameter') {
			substitutions.set(expectedType.name, actualType)
			return
		}
		if (expectedType.kind === 'array' && actualType.kind === 'array') {
			this.collectTypeParameterSubstitutions(expectedType.elementType, actualType.elementType, substitutions)
		}
	}

	private substituteTypeParameters(type: SemanticType, substitutions: Map<string, SemanticType>): SemanticType {
		switch (type.kind) {
			case 'typeParameter':
				return substitutions.get(type.name) ?? type
			case 'array':
				return arrayType(this.substituteTypeParameters(type.elementType, substitutions))
			case 'function':
				return functionType(
					type.paramTypes.map(paramType => this.substituteTypeParameters(paramType, substitutions)),
					this.substituteTypeParameters(type.returnType, substitutions),
				)
			case 'union':
				return unionType(type.types.map(item => this.substituteTypeParameters(item, substitutions)))
			default:
				return type
		}
	}

	private inferLambdaExpressionType(
		expression: Extract<ExpressionNode, {type: 'LambdaExpression'}>,
		expectedType: SemanticType | null,
	): SemanticType {
		const expectedFunctionType = expectedType?.kind === 'function'
			? expectedType
			: null
		const parameterTypes = expression.params.map((param, index) => {
			const explicitType = this.resolveTypeName(param.typeName, [], param)
			return explicitType.kind === 'any'
				? expectedFunctionType?.paramTypes[index] ?? explicitType
				: explicitType
		})
		return this.withContextualParameterTypes(expression, parameterTypes, () => functionType(
			parameterTypes,
			expression.body.type === 'BlockStatement'
				? this.inferBlockReturnType(expression.body.statements)
				: this.inferExpressionType(expression.body, expectedFunctionType?.returnType ?? null),
		))
	}

	private withContextualParameterTypes<TResult>(
		expression: Extract<ExpressionNode, {type: 'LambdaExpression'}>,
		types: SemanticType[],
		callback: () => TResult,
	): TResult {
		const bindings = this.model.functionParameterBindings.get(expression) ?? []
		const previousTypes = new Map<SemanticBinding, SemanticType | null>()
		for (const [index, binding] of bindings.entries()) {
			previousTypes.set(binding, this.contextualParameterTypes.get(binding) ?? null)
			const type = types[index]
			if (type !== undefined) {
				this.contextualParameterTypes.set(binding, type)
			}
		}
		try {
			return callback()
		}
		finally {
			for (const [binding, type] of previousTypes.entries()) {
				if (type === null) {
					this.contextualParameterTypes.delete(binding)
				}
				else {
					this.contextualParameterTypes.set(binding, type)
				}
			}
		}
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
		if (types.some(type => type.kind === 'error')) {
			return errorType()
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
