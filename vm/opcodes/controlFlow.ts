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

type ControlFlowResult =
	| {
		handled: false,
	}
	| {
		handled: true,
		value: Value | undefined,
	}

function execControlFlowOpcode(
	instr: Instruction,
	frame: CallFrame,
	runtime: VmRuntimeContext,
	environment: ControlFlowEnvironment,
): ControlFlowResult {
	const {push, pop} = runtime
	const {frameCount, popFrame} = environment
	switch (instr.op) {
		case Opcode.Return: {
			const returnValue = frameCount > 0
				? pop()
				: null
			popFrame()
			if (frameCount === 1) {
				return {
					handled: true,
					value: returnValue,
				}
			}
			push(returnValue)
			return {
				handled: true,
				value: undefined,
			}
		}
		case Opcode.Jump:
			frame.ip = instr.arg!
			return {
				handled: true,
				value: undefined,
			}
		case Opcode.JumpIfFalse: {
			const condition = pop()
			if (condition !== true) {
				frame.ip = instr.arg!
			}
			return {
				handled: true,
				value: undefined,
			}
		}
		default:
			return {
				handled: false,
			}
	}
}

export {
	execControlFlowOpcode,
}
