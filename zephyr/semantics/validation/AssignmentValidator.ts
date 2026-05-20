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
	) {
	}

	validateAssignment(statement: AssignmentStatementNode): void {
		if (statement.target.type === 'IdentifierTarget') {
			const binding = this.model.assignmentTargetBindings.get(statement.target)
			if (binding !== undefined && !isBindingMutable(binding)) {
				throw new Error(`Нельзя присвоить значение имени: ${statement.target.name}`)
			}
			if (binding !== undefined) {
				this.typeAnalyzer.assertTypeAssignable(
					this.typeAnalyzer.getBindingType(binding),
					this.typeAnalyzer.inferExpressionType(statement.value),
					`присваивание ${statement.target.name}`,
				)
			}
		}
		else if (statement.target.type === 'IndexTarget') {
			this.validateExpression(statement.target.object)
			this.validateExpression(statement.target.index)
			this.typeAnalyzer.assertTypeAssignable(
				primitiveType('number'),
				this.typeAnalyzer.inferExpressionType(statement.target.index),
				'индекс массива',
			)
			this.typeAnalyzer.assertTypeAssignable(
				this.typeAnalyzer.getIndexedElementType(this.typeAnalyzer.inferExpressionType(statement.target.object)),
				this.typeAnalyzer.inferExpressionType(statement.value),
				'присваивание элемента массива',
			)
		}
		else {
			this.validateExpression(statement.target.object)
			const objectType = this.typeAnalyzer.inferExpressionType(statement.target.object)
			this.classValidator.assertClassMemberAccessible(objectType, statement.target.property, 'field')
			const memberType = this.classValidator
				.getClassRegistry()
				.getFieldType(objectType, statement.target.property)
			this.typeAnalyzer.assertTypeAssignable(
				memberType,
				this.typeAnalyzer.inferExpressionType(statement.value),
				`присваивание свойства ${statement.target.property}`,
			)
		}

		this.validateExpression(statement.value)
	}
}

export {
	AssignmentValidator,
}
