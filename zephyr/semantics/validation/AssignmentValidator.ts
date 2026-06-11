import {type AssignmentStatementNode} from '../../ast'
import {type SemanticModel, isBindingMutable} from '../context'
import {primitiveType} from '../SemanticType'
import {type ClassValidator} from './ClassValidator'
import {type TypeAnalyzer} from './TypeAnalyzer'

class AssignmentValidator {
	constructor(
		private readonly model: SemanticModel,
		private readonly typeAnalyzer: TypeAnalyzer,
		private readonly classValidator: ClassValidator,
		private readonly validateExpression: (expression: AssignmentStatementNode['value']) => void,
		private readonly reportStatementError: (error: unknown, statement: AssignmentStatementNode) => void,
	) {
	}

	validateAssignment(statement: AssignmentStatementNode): void {
		if (statement.target.type === 'IdentifierTarget') {
			this.validateIdentifierAssignment(statement)
		}
		else if (statement.target.type === 'IndexTarget') {
			this.validateIndexAssignment(statement)
		}
		else {
			this.validateMemberAssignment(statement)
		}

		this.validateExpression(statement.value)
	}

	private validateIdentifierAssignment(statement: AssignmentStatementNode): void {
		if (statement.target.type !== 'IdentifierTarget') {
			return
		}
		const target = statement.target
		const binding = this.model.assignmentTargetBindings.get(target)
		this.reportAssignmentCheck(statement, () => {
			if (binding !== undefined && !isBindingMutable(binding)) {
				throw new Error(`Нельзя присвоить значение имени: ${target.name}`)
			}
		})
		this.reportAssignmentCheck(statement, () => {
			if (binding !== undefined) {
				this.typeAnalyzer.assertTypeAssignable(
					this.typeAnalyzer.getBindingType(binding),
					this.typeAnalyzer.inferExpressionType(statement.value),
					`присваивание ${target.name}`,
				)
			}
		})
	}

	private validateIndexAssignment(statement: AssignmentStatementNode): void {
		if (statement.target.type !== 'IndexTarget') {
			return
		}
		const target = statement.target
		this.validateExpression(target.object)
		this.validateExpression(target.index)
		this.reportAssignmentCheck(statement, () => {
			this.typeAnalyzer.assertTypeAssignable(
				primitiveType('number'),
				this.typeAnalyzer.inferExpressionType(target.index),
				'индекс массива',
			)
		})
		this.reportAssignmentCheck(statement, () => {
			this.typeAnalyzer.assertTypeAssignable(
				this.typeAnalyzer.getIndexedElementType(this.typeAnalyzer.inferExpressionType(target.object)),
				this.typeAnalyzer.inferExpressionType(statement.value),
				'присваивание элемента массива',
			)
		})
	}

	private validateMemberAssignment(statement: AssignmentStatementNode): void {
		if (statement.target.type !== 'MemberTarget') {
			return
		}
		const target = statement.target
		this.validateExpression(target.object)
		const objectType = this.typeAnalyzer.inferExpressionType(target.object)
		this.reportAssignmentCheck(statement, () => {
			this.classValidator.assertClassMemberAccessible(objectType, target.property, 'field')
		})
		this.reportAssignmentCheck(statement, () => {
			const memberType = this.classValidator
				.getClassRegistry()
				.getFieldType(objectType, target.property)
			this.typeAnalyzer.assertTypeAssignable(
				memberType,
				this.typeAnalyzer.inferExpressionType(statement.value),
				`присваивание свойства ${target.property}`,
			)
		})
	}

	private reportAssignmentCheck(statement: AssignmentStatementNode, check: () => void): void {
		try {
			check()
		}
		catch (error) {
			this.reportStatementError(error, statement)
		}
	}
}

export {
	AssignmentValidator,
}
