import {Opcode} from '../types'
import {
	type CallFrame,
	type Instruction,
	type Value,
	type VmRuntimeContext,
} from './context'

function execScopeOpcode(
	instr: Instruction,
	frame: CallFrame,
	runtime: VmRuntimeContext,
	globals: Map<string, Value>,
): boolean {
	const {
		constants,
		push,
		pop,
	} = runtime
	switch (instr.op) {
		case Opcode.GetLocal: {
			const slot = instr.arg!
			const cell = frame.locals[slot]
			if (cell === undefined) {
				throw new Error(`get_local: слот ${slot}`)
			}
			push(cell.value ?? null)
			return true
		}
		case Opcode.SetLocal: {
			const slot = instr.arg!
			const cell = frame.locals[slot]
			if (cell === undefined) {
				throw new Error(`set_local: слот ${slot}`)
			}
			cell.value = pop()
			return true
		}
		case Opcode.IncLocal: {
			const slot = instr.arg!
			const cell = frame.locals[slot]
			if (cell === undefined) {
				throw new Error(`inc_local: слот ${slot}`)
			}
			cell.value = (cell.value as number) + 1
			return true
		}
		case Opcode.DecLocal: {
			const slot = instr.arg!
			const cell = frame.locals[slot]
			if (cell === undefined) {
				throw new Error(`dec_local: слот ${slot}`)
			}
			cell.value = (cell.value as number) - 1
			return true
		}
		case Opcode.GetUpvalue: {
			if (frame.closure === null) {
				throw new Error('get_upvalue: нет замыкания')
			}
			const cell = frame.closure.upvalues[instr.arg!]
			if (cell === undefined) {
				throw new Error(`get_upvalue: индекс ${instr.arg}`)
			}
			push(cell.value ?? null)
			return true
		}
		case Opcode.SetUpvalue: {
			if (frame.closure === null) {
				throw new Error('set_upvalue: нет замыкания')
			}
			const cell = frame.closure.upvalues[instr.arg!]
			if (cell === undefined) {
				throw new Error(`set_upvalue: индекс ${instr.arg}`)
			}
			cell.value = pop()
			return true
		}
		case Opcode.DefGlobal: {
			const name = constants[instr.arg!] as string
			globals.set(name, pop())
			return true
		}
		case Opcode.SetGlobal: {
			const name = constants[instr.arg!] as string
			globals.set(name, pop())
			return true
		}
		case Opcode.GetGlobal: {
			const name = constants[instr.arg!] as string
			const value = globals.get(name)
			if (value === undefined) {
				throw new Error(`Неизвестная глобальная переменная: ${name}`)
			}
			push(value)
			return true
		}
		default:
			return false
	}
}

export {
	execScopeOpcode,
}
