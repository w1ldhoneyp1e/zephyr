import {type CompilerState} from '../CompilerState'
import {type AssignmentStatementNode, Opcode} from '../context'
import {emitExpression} from './expressionEmitter'

function emitAssignment(
	state: CompilerState,
	statement: AssignmentStatementNode,
): void {
	if (statement.target.type === 'IdentifierTarget') {
		const binding = state.getAssignmentTargetBinding(statement.target)
		state.assertMutable(binding)
		const resolved = state.resolve(binding)
		emitExpression(state, statement.value)
		if (resolved.kind === 'local') {
			state.emitNumArg(Opcode.SetLocal, resolved.slot)
		}
		else {
			state.emitNumArg(Opcode.SetUpvalue, resolved.index)
		}

		return
	}
	if (statement.target.type === 'IndexTarget') {
		emitExpression(state, statement.value)
		emitExpression(state, statement.target.object)
		emitExpression(state, statement.target.index)
		state.emitNoArg(Opcode.SetEl)

		return
	}
	if (statement.target.type === 'MemberTarget') {
		emitExpression(state, statement.value)
		emitExpression(state, statement.target.object)
		const propertyNameIndex = state.addConstant(statement.target.property)
		state.emitNumArg(Opcode.SetProp, propertyNameIndex)

		return
	}
	throw new Error('Неподдерживаемая цель присваивания')
}

export {
	emitAssignment,
}
