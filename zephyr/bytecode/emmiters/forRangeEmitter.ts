import {type BytecodeGenerator} from '../BytecodeGenerator'
import {type CompilerState} from '../CompilerState'
import {type ForRangeStatementNode, Opcode} from '../context'
import {type FunctionCompiler} from '../FunctionCompiler'
import {emitBlock} from './blockEmitter'
import {emitExpression} from './expressionEmitter'

function emitForRange(
	state: CompilerState,
	generator: BytecodeGenerator,
	compiler: FunctionCompiler,
	statement: ForRangeStatementNode,
): void {
	state.enterScope()
	const iteratorSlot = state.declareLocal(statement.iterator, false)
	emitExpression(state, statement.start)
	state.emitNumArg(Opcode.SetLocal, iteratorSlot)
	const endName = `__for_end_${iteratorSlot}_${state.getInstructions().length}`
	const endSlot = state.declareLocal(endName, true)
	emitExpression(state, statement.end)
	state.emitNumArg(Opcode.SetLocal, endSlot)
	const loopStart = state.getInstructions().length
	state.emitNumArg(Opcode.GetLocal, iteratorSlot)
	state.emitNumArg(Opcode.GetLocal, endSlot)
	state.emitNoArg(Opcode.Lt)
	const endJump = state.emitJump(Opcode.JumpIfFalse)
	emitBlock(state, generator, compiler, statement.body.statements)
	state.emitNumArg(Opcode.IncLocal, iteratorSlot)
	state.emitNumArg(Opcode.Jump, loopStart)
	state.patchJump(endJump, state.getInstructions().length)
	state.leaveScope()
}

export {
	emitForRange,
}
