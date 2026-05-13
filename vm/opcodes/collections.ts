import {type VmArray, Opcode} from '../types'
import {
	type Instruction,
	type Value,
	type VmRuntimeContext,
} from './context'

function execCollectionOpcode(
	instr: Instruction,
	runtime: VmRuntimeContext,
): boolean {
	const {
		constants,
		push,
		pop,
	} = runtime
	switch (instr.op) {
		case Opcode.CreateArr: {
			const count = instr.arg!
			const items: Value[] = new Array(count)
			for (let i = count - 1; i >= 0; i--) {
				items[i] = pop()
			}
			push(items)
			return true
		}
		case Opcode.GetEl: {
			const index = pop()
			const collection = pop()
			if (Array.isArray(collection)) {
				push((collection as VmArray)[index as number] ?? null)
				return true
			}
			if (typeof collection === 'string') {
				push(collection[index as number] ?? null)
				return true
			}
			throw new Error('get_el: ожидался массив или строка')
		}
		case Opcode.SetEl: {
			const index = pop()
			const array = pop()
			const value = pop()
			if (!Array.isArray(array)) {
				throw new Error('set_el: ожидался массив')
			}
			(array as VmArray)[index as number] = value
			return true
		}
		case Opcode.GetProp: {
			const propertyNameRaw = constants[instr.arg!]
			if (typeof propertyNameRaw !== 'string') {
				throw new Error('get_prop: ожидалось строковое имя свойства')
			}
			const target = pop()
			if (propertyNameRaw === 'length') {
				if (Array.isArray(target) || typeof target === 'string') {
					push(target.length)
					return true
				}
			}
			throw new Error(`get_prop: неподдерживаемое свойство ${propertyNameRaw}`)
		}
		default:
			return false
	}
}

export {
	execCollectionOpcode,
}
