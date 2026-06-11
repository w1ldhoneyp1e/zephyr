import {type BytecodeGenerator} from '../BytecodeGenerator'
import {type CompilerState} from '../CompilerState'
import {type AssignmentStatementNode, Opcode} from '../context'
import {compilerInvariant} from '../errors'
import {emitExpression} from './expressionEmitter'

function emitAssignment(
	state: CompilerState,
	generator: BytecodeGenerator,
	statement: AssignmentStatementNode,
): void {
	state.withNodeLocation(statement, () => emitAssignmentCore(state, generator, statement))
}

function emitAssignmentCore(
	state: CompilerState,
	generator: BytecodeGenerator,
	statement: AssignmentStatementNode,
): void {
	if (statement.target.type === 'IdentifierTarget') {
		const binding = state.getAssignmentTargetBinding(statement.target)
		state.assertMutable(binding)
		const resolved = state.resolve(binding)
		emitExpression(state, generator, statement.value)
		if (resolved.kind === 'local') {
			state.emitNumArg(Opcode.SetLocal, resolved.slot)
		}
		else {
			state.emitNumArg(Opcode.SetUpvalue, resolved.index)
		}

		return
	}
	if (statement.target.type === 'IndexTarget') {
		emitExpression(state, generator, statement.value)
		emitExpression(state, generator, statement.target.object)
		emitExpression(state, generator, statement.target.index)
		state.emitNoArg(Opcode.SetEl)

		return
	}
	if (statement.target.type === 'MemberTarget') {
		emitExpression(state, generator, statement.value)
		emitExpression(state, generator, statement.target.object)
		const propertyNameIndex = state.addConstant(statement.target.property)
		state.emitNumArg(Opcode.SetProp, propertyNameIndex)

		return
	}
	compilerInvariant(`unsupported assignment target: ${(statement.target as {type: string}).type}`)
}

export {
	emitAssignment,
}
