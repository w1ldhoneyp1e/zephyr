import {
	type ExpressionNode,
	type MatchByExpressionNode,
	type ProgramNode,
	type StatementNode,
} from '../ast'
import {type DiagnosticReporter, type NodeLocations} from '../diagnostics'
import {match} from '../utils'
import {ClassRegistry} from './ClassRegistry'
import {type CallableDeclarationNode, type SemanticModel} from './context'
import {primitiveType, removeNullFromType} from './SemanticType'
import {AssignmentValidator} from './validation/AssignmentValidator'
import {CallValidator} from './validation/CallValidator'
import {ClassValidator} from './validation/ClassValidator'
import {TypeAnalyzer} from './validation/TypeAnalyzer'
import {ValidationDiagnostics} from './validation/ValidationDiagnostics'
import {ValidationWalker} from './validation/ValidationWalker'

class Validator {
	private currentClassStack: string[] = []
	private classRegistry: ClassRegistry | null = null
	private typeAnalyzer: TypeAnalyzer | null = null
	private classValidator: ClassValidator | null = null
	private callValidator: CallValidator | null = null
	private assignmentValidator: AssignmentValidator | null = null
	private validationWalker: ValidationWalker | null = null
	private validationDiagnostics: ValidationDiagnostics | null = null
	private nullableGuards: string[] = []

	constructor(
		private readonly nodeLocations: NodeLocations,
		private readonly reporter: DiagnosticReporter,
	) {}

	validateProgram(program: ProgramNode, model: SemanticModel): ProgramNode {
		this.validationDiagnostics = new ValidationDiagnostics(this.reporter, this.nodeLocations)
		this.classRegistry = new ClassRegistry(model)
		this.typeAnalyzer = new TypeAnalyzer(model, this.classRegistry, this.reporter, this.nodeLocations)
		this.classValidator = new ClassValidator(
			model,
			this.classRegistry,
			() => this.getCurrentClassName(),
		)
		this.callValidator = new CallValidator(
			model,
			this.classRegistry,
			this.typeAnalyzer,
			(error, expression) => this.getValidationDiagnostics().reportForExpression(error, expression),
		)
		this.assignmentValidator = new AssignmentValidator(
			model,
			this.typeAnalyzer,
			this.classValidator,
			expression => this.validateExpression(expression),
			(error, statement) => this.getValidationDiagnostics().reportForStatement(error, statement),
		)
		this.validationWalker = new ValidationWalker(
			statement => this.validateStatement(statement, model),
			expression => this.validateExpression(expression),
		)
		for (const statement of program.body) {
			this.validateStatement(statement, model)
		}

		return program
	}

	private validateStatement(statement: StatementNode, model: SemanticModel): void {
		this.getValidationDiagnostics().runForStatement(statement, () => {
			this.validateStatementCore(statement, model)
		})
	}

	private validateStatementCore(statement: StatementNode, model: SemanticModel): void {
		switch (statement.type) {
			case 'VariableDeclaration':
				if (statement.initializer !== null) {
					this.validateExpression(statement.initializer)
					this.getTypeAnalyzer().assertExpressionAssignable(
						this.getTypeAnalyzer().resolveTypeName(statement.typeName, [], statement),
						statement.initializer,
						`инициализатор переменной ${statement.name}`,
					)
				}
				return
			case 'TypeAliasDeclaration':
				return
			case 'FunctionDeclaration':
				this.validateCallableBody(statement)
				return
			case 'ClassDeclaration':
				this.validateClassDeclaration(statement)
				return
			case 'ReturnStatement':
				if (statement.value !== null) {
					this.validateExpression(statement.value)
					const owner = model.returnOwners.get(statement)
					if (owner !== undefined && owner !== null) {
						if (owner.type === 'ConstructorDeclaration') {
							throw new Error('Нельзя использовать return внутри constructor')
						}
						if (owner.type === 'LambdaExpression') {
							return
						}
						this.getTypeAnalyzer().assertExpressionAssignable(
							this.getTypeAnalyzer().resolveTypeName(
								owner.returnTypeName,
								owner.type === 'FunctionDeclaration'
									? owner.typeParams
									: [],
								statement,
							),
							statement.value,
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
			case 'IfStatement':
			case 'WhileStatement':
			case 'ForStatement':
			case 'ForRangeStatement':
			case 'BlockStatement':
			case 'ExpressionStatement':
				this.getValidationWalker().walkStatementChildren(statement)
				return
			case 'AssignmentStatement':
				this.getAssignmentValidator().validateAssignment(statement)
				return
			default:
				throw new Error(`Validator: неподдерживаемый statement: ${(statement as {type: string}).type}`)
		}
	}

	private validateCallableBody(callable: CallableDeclarationNode): void {
		this.getValidationWalker().walkCallableBody(callable)
	}

	private validateClassDeclaration(statement: Extract<StatementNode, {type: 'ClassDeclaration'}>): void {
		const validator = this.getClassValidator()
		this.reportClassDeclarationCheck(statement, () => validator.assertValidBaseClass(statement))
		this.reportClassDeclarationCheck(statement, () => validator.assertNoInheritanceCycle(statement.name))
		for (const field of validator.getDuplicateFields(statement.fields)) {
			this.getValidationDiagnostics().reportForNode(
				new Error(`Повторное объявление поля класса: ${field.name}`),
				field,
			)
		}
		for (const method of validator.getDuplicateMethods(statement)) {
			this.getValidationDiagnostics().reportForNode(
				new Error(`Повторное объявление метода класса ${statement.name}: ${method.name}`),
				method,
			)
		}
		for (const method of validator.getMemberNameConflicts(statement)) {
			this.getValidationDiagnostics().reportForNode(
				new Error(`Конфликт имени члена класса ${statement.name}: ${method.name} объявлен и как поле, и как метод`),
				method,
			)
		}

		this.currentClassStack.push(statement.name)
		try {
			if (statement.constructorDeclaration !== null) {
				this.validateCallableBody(statement.constructorDeclaration)
			}
			for (const method of statement.methods) {
				this.validateCallableBody(method)
			}
		}
		finally {
			this.currentClassStack.pop()
		}
	}

	private reportClassDeclarationCheck(
		statement: Extract<StatementNode, {type: 'ClassDeclaration'}>,
		check: () => void,
	): void {
		this.getValidationDiagnostics().runForStatement(statement, check)
	}

	private validateExpression(expression: ExpressionNode): void {
		this.getValidationDiagnostics().runForExpression(expression, () => {
			this.validateExpressionCore(expression)
		})
	}

	private validateExpressionCore(expression: ExpressionNode): void {
		switch (expression.type) {
			case 'LiteralExpression':
			case 'IdentifierExpression':
				return
			case 'IndexExpression':
			case 'OptionalIndexExpression':
			case 'MemberExpression':
			case 'OptionalMemberExpression':
				this.getValidationWalker().walkExpressionChildren(expression)
				if ('property' in expression) {
					if (expression.type === 'MemberExpression') {
						this.getClassValidator().assertClassMemberAccessible(
							this.getMemberObjectType(expression.object),
							expression.property,
						)
					}
				}
				if ('index' in expression) {
					this.getTypeAnalyzer().assertTypeAssignable(
						primitiveType('number'),
						this.getTypeAnalyzer().inferExpressionType(expression.index),
						'индекс массива',
					)
				}
				return
			case 'CallExpression':
				this.getValidationWalker().walkExpressionChildren(expression)
				this.getCallValidator().validateCallExpression(expression)
				return
			case 'LambdaExpression':
				this.getValidationWalker().walkExpressionChildren(expression)
				return
			case 'UnaryExpression':
			case 'ArrayExpression':
			case 'ObjectExpression':
				this.getValidationWalker().walkExpressionChildren(expression)
				return
			case 'BinaryExpression':
				this.validateBinaryExpression(expression)
				return
			case 'MatchExpression':
				this.getValidationWalker().walkExpressionChildren(expression)
				this.validateMatchExpression(expression)
				return
			case 'MatchByExpression':
				this.getValidationWalker().walkExpressionChildren(expression)
				this.validateMatchByExhaustiveness(expression)
				return
			case 'ChooseExpression':
			case 'CollectExpression':
				this.getValidationWalker().walkExpressionChildren(expression)
				this.validateConditionalExpressionBranches(expression)
				return
			default:
				throw new Error(`Validator: неподдерживаемое выражение: ${(expression as {type: string}).type}`)
		}
	}

	private validateMatchExpression(expression: Extract<ExpressionNode, {type: 'MatchExpression'}>): void {
		this.reportExpressionCheck(expression, () => {
			if (expression.defaultValue === null) {
				throw new Error('match без ветки _ пока поддерживается только для exhaustive match by')
			}
		})
	}

	private validateConditionalExpressionBranches(
		expression: Extract<ExpressionNode, {type: 'ChooseExpression' | 'CollectExpression'}>,
	): void {
		for (const branch of expression.branches) {
			this.reportExpressionCheck(branch.condition, () => {
				this.getTypeAnalyzer().assertTypeAssignable(
					primitiveType('boolean'),
					this.getTypeAnalyzer().inferExpressionType(branch.condition),
					expression.type === 'ChooseExpression'
						? 'условие choose'
						: 'условие collect',
				)
			})
		}
	}

	private validateMatchByExhaustiveness(expression: MatchByExpressionNode): void {
		const subjectType = this.getTypeAnalyzer().inferExpressionType(expression.subject)
		const variants = this.getClassRegistry().getDiscriminantVariants(subjectType, expression.discriminant)
		this.reportDuplicateMatchByBranches(expression)
		if (variants.length > 0) {
			this.reportImpossibleMatchByBranches(expression, variants)
		}
		if (expression.defaultValue !== null) {
			return
		}
		if (variants.length === 0) {
			this.reportExpressionCheck(expression, () => {
				throw new Error(`match by ${expression.discriminant} без _ не может быть проверен на полноту`)
			})
			return
		}
		const coveredValues = new Set(expression.branches.map(branch =>
			this.getMatchByPatternKey(branch.pattern.value),
		))
		const missingValues = variants
			.map(variant => variant.value)
			.filter(value => !coveredValues.has(this.getMatchByPatternKey(value)))
		if (missingValues.length > 0) {
			this.reportExpressionCheck(expression, () => {
				throw new Error(`match by ${expression.discriminant} не покрывает варианты: ${missingValues.map(String).join(', ')}`)
			})
		}
	}

	private reportExpressionCheck(expression: ExpressionNode, check: () => void): void {
		this.getValidationDiagnostics().runForExpression(expression, check)
	}

	private validateBinaryExpression(expression: Extract<ExpressionNode, {type: 'BinaryExpression'}>): void {
		this.validateExpression(expression.left)
		const guard = this.getShortCircuitNullableGuard(expression)
		if (guard !== null) {
			this.nullableGuards.push(guard)
			this.validateExpression(expression.right)
			this.nullableGuards.pop()
			return
		}
		this.validateExpression(expression.right)
	}

	private getShortCircuitNullableGuard(
		expression: Extract<ExpressionNode, {type: 'BinaryExpression'}>,
	): string | null {
		if (expression.operator !== '&&' && expression.operator !== '||') {
			return null
		}
		const left = expression.left
		if (left.type !== 'BinaryExpression') {
			return null
		}
		const identifierName = this.getNullCheckIdentifierName(left)
		if (identifierName === null) {
			return null
		}
		if (expression.operator === '&&' && left.operator === '!=') {
			return identifierName
		}
		if (expression.operator === '||' && left.operator === '==') {
			return identifierName
		}
		return null
	}

	private getNullCheckIdentifierName(expression: Extract<ExpressionNode, {type: 'BinaryExpression'}>): string | null {
		if (expression.left.type === 'IdentifierExpression' && this.isNullLiteral(expression.right)) {
			return expression.left.name
		}
		if (expression.right.type === 'IdentifierExpression' && this.isNullLiteral(expression.left)) {
			return expression.right.name
		}
		return null
	}

	private isNullLiteral(expression: ExpressionNode): boolean {
		return expression.type === 'LiteralExpression' && expression.value === null
	}

	private getMemberObjectType(object: ExpressionNode): ReturnType<TypeAnalyzer['inferExpressionType']> {
		const type = this.getTypeAnalyzer().inferExpressionType(object)
		return object.type === 'IdentifierExpression' && this.nullableGuards.includes(object.name)
			? removeNullFromType(type)
			: type
	}

	private reportDuplicateMatchByBranches(expression: MatchByExpressionNode): void {
		const seenValues = new Set<string>()
		for (const branch of expression.branches) {
			const key = this.getMatchByPatternKey(branch.pattern.value)
			if (seenValues.has(key)) {
				this.getValidationDiagnostics().reportForNode(
					new Error(`match by ${expression.discriminant} содержит дублирующую ветку: ${String(branch.pattern.value)}`),
					branch.pattern,
				)
			}
			seenValues.add(key)
		}
	}

	private reportImpossibleMatchByBranches(
		expression: MatchByExpressionNode,
		variants: {
			value: string | number | boolean | null,
		}[],
	): void {
		const possibleValues = new Set(variants.map(variant => this.getMatchByPatternKey(variant.value)))
		for (const branch of expression.branches) {
			if (!possibleValues.has(this.getMatchByPatternKey(branch.pattern.value))) {
				this.getValidationDiagnostics().reportForNode(
					new Error(`match by ${expression.discriminant} содержит невозможную ветку: ${String(branch.pattern.value)}`),
					branch.pattern,
				)
			}
		}
	}

	private getMatchByPatternKey(value: string | number | boolean | null): string {
		return `${typeof value}:${String(value)}`
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

	private getCallValidator(): CallValidator {
		if (this.callValidator === null) {
			throw new Error('CallValidator не инициализирован')
		}

		return this.callValidator
	}

	private getAssignmentValidator(): AssignmentValidator {
		if (this.assignmentValidator === null) {
			throw new Error('AssignmentValidator не инициализирован')
		}

		return this.assignmentValidator
	}

	private getValidationWalker(): ValidationWalker {
		if (this.validationWalker === null) {
			throw new Error('ValidationWalker не инициализирован')
		}

		return this.validationWalker
	}

	private getValidationDiagnostics(): ValidationDiagnostics {
		if (this.validationDiagnostics === null) {
			throw new Error('ValidationDiagnostics не инициализирован')
		}

		return this.validationDiagnostics
	}

	private describeCallable(callable: CallableDeclarationNode): string {
		return match(callable, 'type', {
			FunctionDeclaration: value => `функции ${value.name}`,
			MethodDeclaration: value => `методе ${value.name}`,
			ConstructorDeclaration: 'constructor',
			LambdaExpression: 'лямбде',
		})
	}
}

export {
	Validator,
}
