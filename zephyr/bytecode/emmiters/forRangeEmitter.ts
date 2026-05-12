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
	compiler.beginLoop()
	const iteratorBinding = state.getForRangeBinding(statement)
	const iteratorSlot = state.declareBinding(iteratorBinding)
	emitExpression(state, statement.start)
	state.emitNumArg(Opcode.SetLocal, iteratorSlot)
	const endName = `__for_end_${iteratorSlot}_${state.getInstructions().length}`
	const endSlot = state.declareInternalLocal(endName)
	emitExpression(state, statement.end)
	state.emitNumArg(Opcode.SetLocal, endSlot)
	const loopStart = state.getInstructions().length
	state.emitNumArg(Opcode.GetLocal, iteratorSlot)
	state.emitNumArg(Opcode.GetLocal, endSlot)
	state.emitNoArg(Opcode.Lt)
	const endJump = state.emitJump(Opcode.JumpIfFalse)
	emitBlock(state, generator, compiler, statement.body.statements)
	compiler.setContinueTarget(state.getInstructions().length)
	state.emitNumArg(Opcode.IncLocal, iteratorSlot)
	state.emitNumArg(Opcode.Jump, loopStart)
	const loopEnd = state.getInstructions().length
	state.patchJump(endJump, loopEnd)
	compiler.endLoop(loopEnd)
	state.leaveScope()
}

export {
	emitForRange,
}
