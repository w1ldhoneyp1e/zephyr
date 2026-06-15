import {type ExpressionNode, type StatementNode} from '../../ast'
import {type CallableDeclarationNode} from '../context'

class ValidationWalker {
	constructor(
		private readonly validateStatement: (statement: StatementNode) => void,
		private readonly validateExpression: (expression: ExpressionNode) => void,
	) {
	}

	walkCallableBody(callable: CallableDeclarationNode): void {
		if (callable.type === 'LambdaExpression') {
			if (callable.body.type === 'BlockStatement') {
				for (const bodyStatement of callable.body.statements) {
					this.validateStatement(bodyStatement)
				}
			}
			else {
				this.validateExpression(callable.body)
			}
			return
		}

		for (const bodyStatement of callable.body.statements) {
			this.validateStatement(bodyStatement)
		}
	}

	walkStatementChildren(statement: StatementNode): void {
		switch (statement.type) {
			case 'IfStatement':
				this.validateExpression(statement.condition)
				for (const bodyStatement of statement.thenBranch.statements) {
					this.validateStatement(bodyStatement)
				}
				if (statement.elseBranch !== null) {
					for (const bodyStatement of statement.elseBranch.statements) {
						this.validateStatement(bodyStatement)
					}
				}
				break
			case 'WhileStatement':
				this.validateExpression(statement.condition)
				for (const bodyStatement of statement.body.statements) {
					this.validateStatement(bodyStatement)
				}
				break
			case 'ForRangeStatement':
				this.validateExpression(statement.start)
				this.validateExpression(statement.end)
				for (const bodyStatement of statement.body.statements) {
					this.validateStatement(bodyStatement)
				}
				break
			case 'ForStatement':
				this.validateExpression(statement.start)
				this.validateExpression(statement.condition)
				this.validateExpression(statement.increment)
				for (const bodyStatement of statement.body.statements) {
					this.validateStatement(bodyStatement)
				}
				break
			case 'BlockStatement':
				for (const bodyStatement of statement.statements) {
					this.validateStatement(bodyStatement)
				}
				break
			case 'ExpressionStatement':
				this.validateExpression(statement.expression)
				break
			default:
				break
		}
	}

	walkExpressionChildren(expression: ExpressionNode): void {
		switch (expression.type) {
			case 'UnaryExpression':
				this.validateExpression(expression.argument)
				break
			case 'BinaryExpression':
				this.validateExpression(expression.left)
				this.validateExpression(expression.right)
				break
			case 'ArrayExpression':
				for (const element of expression.elements) {
					this.validateExpression(element)
				}
				break
			case 'ObjectExpression':
				for (const property of expression.properties) {
					this.validateExpression(property.value)
				}
				break
			case 'ChooseExpression':
			case 'CollectExpression':
				for (const branch of expression.branches) {
					this.validateExpression(branch.condition)
					this.validateExpression(branch.value)
				}
				if (expression.type === 'ChooseExpression') {
					this.validateExpression(expression.defaultValue)
				}
				break
			case 'MatchExpression':
				this.validateExpression(expression.subject)
				for (const branch of expression.branches) {
					this.validateExpression(branch.pattern)
					this.validateExpression(branch.value)
				}
				if (expression.defaultValue !== null) {
					this.validateExpression(expression.defaultValue)
				}
				break
			case 'MatchByExpression':
				this.validateExpression(expression.subject)
				for (const branch of expression.branches) {
					this.validateExpression(branch.value)
				}
				if (expression.defaultValue !== null) {
					this.validateExpression(expression.defaultValue)
				}
				break
			case 'IndexExpression':
			case 'OptionalIndexExpression':
			case 'MemberExpression':
			case 'OptionalMemberExpression':
				this.validateExpression(expression.object)
				if ('index' in expression) {
					this.validateExpression(expression.index)
				}
				break
			case 'CallExpression':
				this.validateExpression(expression.callee)
				for (const arg of expression.args) {
					this.validateExpression(arg)
				}
				break
			case 'LambdaExpression':
				this.walkCallableBody(expression)
				break
			default:
				break
		}
	}
}

export {
	ValidationWalker,
}
