import {type CompilerState} from '../CompilerState'
import {type AssignmentStatementNode, Opcode} from '../context'
import {emitExpression} from './expressionEmitter'

function emitAssignment(
	state: CompilerState,
	statement: AssignmentStatementNode,
): void {
	if (statement.target.type === 'IdentifierTarget') {
		state.assertMutable(statement.target.name)
		const resolved = state.resolve(statement.target.name)
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
	throw new Error('Неподдерживаемая цель присваивания')
}

export {
	emitAssignment,
}
