import {type VmArray, Opcode} from '../types'
import {
	type Instruction,
	type Value,
	type VmRuntimeContext,
} from './context'

function execScalarOpcode(
	instr: Instruction,
	runtime: VmRuntimeContext,
): Value | undefined | null {
	const {
		constants,
		push,
		pop,
		popNum,
		popBool,
	} = runtime
	switch (instr.op) {
		case Opcode.Const: {
			const idx = instr.arg!
			const constant = constants[idx]
			if (constant === undefined) {
				throw new Error(`const: нет константы ${idx}`)
			}
			if (typeof constant === 'object' && constant !== null && 'kind' in constant && constant.kind === 'function') {
				throw new Error('const: нельзя загружать шаблон функции как значение')
			}
			push(constant as Value)
			return undefined
		}
		case Opcode.True:
			push(true)
			return undefined
		case Opcode.False:
			push(false)
			return undefined
		case Opcode.Nil:
			push(null)
			return undefined
		case Opcode.Pop:
			pop()
			return undefined
		case Opcode.Add: {
			const right = pop()
			const left = pop()
			if (typeof left === 'number' && typeof right === 'number') {
				push(left + right)
				return undefined
			}
			if (typeof left === 'string' && typeof right === 'string') {
				push(left + right)
				return undefined
			}
			if (Array.isArray(left) && Array.isArray(right)) {
				push([...(left as VmArray), ...(right as VmArray)])
				return undefined
			}
			throw new Error(`add: несовместимые типы: ${typeof left} и ${typeof right}`)
		}
		case Opcode.Sub: {
			const right = popNum()
			push(popNum() - right)
			return undefined
		}
		case Opcode.Mul: {
			const right = popNum()
			push(popNum() * right)
			return undefined
		}
		case Opcode.Div: {
			const right = popNum()
			if (right === 0) {
				throw new Error('Divide by zero')
			}
			push(popNum() / right)
			return undefined
		}
		case Opcode.Mod: {
			const right = popNum()
			if (right === 0) {
				throw new Error('Divide by zero')
			}
			push(popNum() % right)
			return undefined
		}
		case Opcode.Neg:
			push(-popNum())
			return undefined
		case Opcode.Eq: {
			const right = pop()
			const left = pop()
			push(left === right)
			return undefined
		}
		case Opcode.Ne: {
			const right = pop()
			const left = pop()
			push(left !== right)
			return undefined
		}
		case Opcode.Lt: {
			const right = popNum()
			push(popNum() < right)
			return undefined
		}
		case Opcode.Lte: {
			const right = popNum()
			push(popNum() <= right)
			return undefined
		}
		case Opcode.Gt: {
			const right = popNum()
			push(popNum() > right)
			return undefined
		}
		case Opcode.Gte: {
			const right = popNum()
			push(popNum() >= right)
			return undefined
		}
		case Opcode.And: {
			const right = popBool()
			push(popBool() && right)
			return undefined
		}
		case Opcode.Or: {
			const right = popBool()
			push(popBool() || right)
			return undefined
		}
		case Opcode.Not:
			push(!popBool())
			return undefined
		default:
			return null
	}
}

export {
	execScalarOpcode,
}
