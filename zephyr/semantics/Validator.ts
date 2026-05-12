import {
	type ExpressionNode,
	type ProgramNode,
	type StatementNode,
} from '../ast'
import {type SemanticModel, isBindingMutable} from './context'

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
				}
				return
			case 'FunctionDeclaration':
				for (const bodyStatement of statement.body.statements) {
					this.validateStatement(bodyStatement, model)
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
				if (model.returnOwners.get(statement) === null) {
					throw new Error('Нельзя использовать return вне функции')
				}
				if (statement.value !== null) {
					this.validateExpression(statement.value, model)
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
				}
				else {
					this.validateExpression(statement.target.object, model)
					this.validateExpression(statement.target.index, model)
				}
				this.validateExpression(statement.value, model)
				return
			default:
				throw new Error(`Validator: неподдерживаемый statement: ${(statement as {type: string}).type}`)
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
				this.validateExpression(expression.object, model)
				this.validateExpression(expression.index, model)
				return
			case 'CallExpression':
				this.validateExpression(expression.callee, model)
				for (const arg of expression.args) {
					this.validateExpression(arg, model)
				}
				return
			default:
				throw new Error(`Validator: неподдерживаемое выражение: ${(expression as {type: string}).type}`)
		}
	}
}

export {
	Validator,
}
