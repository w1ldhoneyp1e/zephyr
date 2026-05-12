import {Opcode} from '../types'
import {
	type CallFrame,
	type Instruction,
	type Value,
	type VmRuntimeContext,
} from './context'

interface ControlFlowEnvironment {
	frameCount: number,
	popFrame: () => void,
}

function execControlFlowOpcode(
	instr: Instruction,
	frame: CallFrame,
	runtime: VmRuntimeContext,
	environment: ControlFlowEnvironment,
): Value | undefined | null {
	const {push, pop} = runtime
	const {frameCount, popFrame} = environment
	switch (instr.op) {
		case Opcode.Return: {
			const returnValue = frameCount > 0
				? pop()
				: null
			popFrame()
			if (frameCount === 1) {
				return returnValue
			}
			push(returnValue)
			return undefined
		}
		case Opcode.Jump:
			frame.ip = instr.arg!
			return undefined
		case Opcode.JumpIfFalse: {
			const condition = pop()
			if (condition !== true) {
				frame.ip = instr.arg!
			}
			return undefined
		}
		default:
			return null
	}
}

export {
	execControlFlowOpcode,
}
