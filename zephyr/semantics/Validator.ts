import {
	type ExpressionNode,
	type MatchByExpressionNode,
	type ProgramNode,
	type StatementNode,
} from '../ast'
import {match} from '../utils'
import {ClassRegistry} from './ClassRegistry'
import {type CallableDeclarationNode, type SemanticModel} from './context'
import {primitiveType} from './SemanticType'
import {AssignmentValidator} from './validation/AssignmentValidator'
import {CallValidator} from './validation/CallValidator'
import {ClassValidator} from './validation/ClassValidator'
import {TypeAnalyzer} from './validation/TypeAnalyzer'
import {ValidationWalker} from './validation/ValidationWalker'

class Validator {
	private currentClassStack: string[] = []
	private classRegistry: ClassRegistry | null = null
	private typeAnalyzer: TypeAnalyzer | null = null
	private classValidator: ClassValidator | null = null
	private callValidator: CallValidator | null = null
	private assignmentValidator: AssignmentValidator | null = null
	private validationWalker: ValidationWalker | null = null

	validateProgram(program: ProgramNode, model: SemanticModel): ProgramNode {
		this.classRegistry = new ClassRegistry(model)
		this.typeAnalyzer = new TypeAnalyzer(model, this.classRegistry)
		this.classValidator = new ClassValidator(
			model,
			this.classRegistry,
			() => this.getCurrentClassName(),
		)
		this.callValidator = new CallValidator(model, this.classRegistry, this.typeAnalyzer)
		this.assignmentValidator = new AssignmentValidator(
			model,
			this.typeAnalyzer,
			this.classValidator,
			expression => this.validateExpression(expression),
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
		switch (statement.type) {
			case 'VariableDeclaration':
				if (statement.initializer !== null) {
					this.validateExpression(statement.initializer)
					this.getTypeAnalyzer().assertTypeAssignable(
						this.getTypeAnalyzer().resolveTypeName(statement.typeName),
						this.getTypeAnalyzer().inferExpressionType(statement.initializer),
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
				this.getClassValidator().assertValidBaseClass(statement)
				this.getClassValidator().assertNoInheritanceCycle(statement.name)
				this.getClassValidator().assertUniqueFieldNames(statement.fields)
				this.getClassValidator().assertUniqueMethodNames(statement)
				this.getClassValidator().assertNoMemberNameConflicts(statement)
				this.currentClassStack.push(statement.name)
				if (statement.constructorDeclaration !== null) {
					this.validateCallableBody(statement.constructorDeclaration)
				}
				for (const method of statement.methods) {
					this.validateCallableBody(method)
				}
				this.currentClassStack.pop()
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
						this.getTypeAnalyzer().assertTypeAssignable(
							this.getTypeAnalyzer().resolveTypeName(owner.returnTypeName),
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
			case 'IfStatement':
			case 'WhileStatement':
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

	private validateExpression(expression: ExpressionNode): void {
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
							this.getTypeAnalyzer().inferExpressionType(expression.object),
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
			case 'BinaryExpression':
			case 'ArrayExpression':
				this.getValidationWalker().walkExpressionChildren(expression)
				return
			case 'MatchExpression':
				this.getValidationWalker().walkExpressionChildren(expression)
				if (expression.defaultValue === null) {
					throw new Error('match без ветки _ пока поддерживается только для exhaustive match by')
				}
				return
			case 'MatchByExpression':
				this.getValidationWalker().walkExpressionChildren(expression)
				this.validateMatchByExhaustiveness(expression)
				return
			case 'ChooseExpression':
			case 'CollectExpression':
				this.getValidationWalker().walkExpressionChildren(expression)
				for (const branch of expression.branches) {
					this.getTypeAnalyzer().assertTypeAssignable(
						primitiveType('boolean'),
						this.getTypeAnalyzer().inferExpressionType(branch.condition),
						expression.type === 'ChooseExpression'
							? 'условие choose'
							: 'условие collect',
					)
				}
				return
			default:
				throw new Error(`Validator: неподдерживаемое выражение: ${(expression as {type: string}).type}`)
		}
	}

	private validateMatchByExhaustiveness(expression: MatchByExpressionNode): void {
		if (expression.defaultValue !== null) {
			return
		}
		const subjectType = this.getTypeAnalyzer().inferExpressionType(expression.subject)
		const variants = this.getClassRegistry().getDiscriminantVariants(subjectType, expression.discriminant)
		if (variants.length === 0) {
			throw new Error(`match by ${expression.discriminant} без _ не может быть проверен на полноту`)
		}
		const coveredValues = new Set(expression.branches.map(branch =>
			this.getMatchByPatternKey(branch.pattern.value),
		))
		const missingValues = variants
			.map(variant => variant.value)
			.filter(value => !coveredValues.has(this.getMatchByPatternKey(value)))
		if (missingValues.length > 0) {
			throw new Error(`match by ${expression.discriminant} не покрывает варианты: ${missingValues.map(String).join(', ')}`)
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
