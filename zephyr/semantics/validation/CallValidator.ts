import {type CallExpressionNode, type ExpressionNode} from '../../ast'
import {type ClassRegistry} from '../ClassRegistry'
import {type SemanticModel} from '../context'
import {type TypeAnalyzer} from './TypeAnalyzer'

class CallValidator {
	constructor(
		private readonly model: SemanticModel,
		private readonly classRegistry: ClassRegistry,
		private readonly typeAnalyzer: TypeAnalyzer,
	) {
	}

	validateCallExpression(expression: CallExpressionNode): void {
		if (expression.callee.type === 'IdentifierExpression') {
			const binding = this.model.identifierBindings.get(expression.callee)
			if (binding?.kind === 'function') {
				this.validateCallArguments(
					expression.args,
					binding.declaration.params.map(param => param.typeName),
					`вызов функции ${binding.declaration.name}`,
				)
				return
			}
			if (binding?.kind === 'class') {
				this.validateCallArguments(
					expression.args,
					this.classRegistry.getConstructorParameterTypes(binding.declaration.name),
					`создание класса ${binding.declaration.name}`,
				)
				return
			}
			if (binding?.kind === 'super') {
				this.validateCallArguments(
					expression.args,
					this.classRegistry.getConstructorParameterTypes(binding.baseClassBinding.declaration.name),
					`вызов super для ${binding.baseClassBinding.declaration.name}`,
				)
			}
			return
		}

		if (expression.callee.type === 'MemberExpression' || expression.callee.type === 'OptionalMemberExpression') {
			const objectType = this.typeAnalyzer.inferExpressionType(expression.callee.object)
			this.validateCallArguments(
				expression.args,
				this.classRegistry.getMethodParameterTypes(objectType, expression.callee.property),
				`вызов метода ${expression.callee.property}`,
			)
		}
	}

	private validateCallArguments(
		args: ExpressionNode[],
		expectedTypes: string[],
		context: string,
	): void {
		if (args.length !== expectedTypes.length) {
			throw new Error(`Неверное число аргументов в ${context}: ожидалось ${expectedTypes.length}, получено ${args.length}`)
		}

		for (const [index, arg] of args.entries()) {
			this.typeAnalyzer.assertTypeAssignable(
				expectedTypes[index],
				this.typeAnalyzer.inferExpressionType(arg),
				`${context}, аргумент ${index + 1}`,
			)
		}
	}
}

export {
	CallValidator,
}
