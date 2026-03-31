import {
	type Instruction,
	type Value,
	type VmArray,
	type VmProgram,
	Opcode,
} from './types'

function formatValue(v: Value): string {
	if (v === null) {
		return 'null'
	}
	if (Array.isArray(v)) {
		return `[${v.map(formatValue).join(', ')}]`
	}

	return String(v)
}

class Vm {
	private programs: VmProgram[] = []
	private globals = new Map<string, Value>()

	load(programs: VmProgram[]): void {
		this.programs = programs
	}

	run(): Value {
		if (this.programs.length === 0) {
			throw new Error('Нет программы для выполнения')
		}

		return this.execProgram(this.programs[0])
	}

	private execProgram(program: VmProgram): Value {
		const {
			constants, instructions, localsCount, argc,
		} = program
		const locals: Value[] = new Array(Math.max(localsCount, argc)).fill(null)
		const stack: Value[] = []
		let ip = 0

		const push = (v: Value): void => {
			stack.push(v)
		}

		const pop = (): Value => {
			if (stack.length === 0) {
				throw new Error(`Стек пуст (ip=${ip})`)
			}

			return stack.pop()!
		}

		const popNum = (): number => {
			const v = pop()
			if (typeof v !== 'number') {
				throw new Error(`Ожидалось число, получено: ${typeof v}`)
			}

			return v
		}

		while (ip < instructions.length) {
			const instr = instructions[ip] as Instruction & {arg?: number}
			ip++

			switch (instr.op) {
				case Opcode.Const: {
					push(constants[instr.arg!])
					break
				}

				case Opcode.True: {
					push(true)
					break
				}

				case Opcode.False: {
					push(false)
					break
				}

				case Opcode.Nil: {
					push(null)
					break
				}

				case Opcode.Pop: {
					pop()
					break
				}

				case Opcode.Add: {
					const b = pop()
					const a = pop()
					if (typeof a === 'number' && typeof b === 'number') {
						push(a + b)
					}
					else if (typeof a === 'string' && typeof b === 'string') {
						push(a + b)
					}
					else if (Array.isArray(a) && Array.isArray(b)) {
						push([...(a as VmArray), ...(b as VmArray)])
					}
					else {
						throw new Error(`add: несовместимые типы: ${typeof a} и ${typeof b}`)
					}
					break
				}

				case Opcode.Sub: {
					const bSub = popNum()
					push(popNum() - bSub)
					break
				}

				case Opcode.Mul: {
					const bMul = popNum()
					push(popNum() * bMul)
					break
				}

				case Opcode.Div: {
					const bDiv = popNum()
					if (bDiv === 0) {
						throw new Error('Divide by zero')
					}
					push(popNum() / bDiv)
					break
				}

				case Opcode.Mod: {
					const bMod = popNum()
					if (bMod === 0) {
						throw new Error('Divide by zero')
					}
					push(popNum() % bMod)
					break
				}

				case Opcode.Neg: {
					push(-popNum())
					break
				}

				case Opcode.Return: {
					return stack.length > 0
						? pop()
						: null
				}

				case Opcode.GetLocal: {
					push(locals[instr.arg!] ?? null)
					break
				}

				case Opcode.SetLocal: {
					locals[instr.arg!] = pop()
					break
				}

				case Opcode.IncLocal: {
					locals[instr.arg!] = (locals[instr.arg!] as number) + 1
					break
				}

				case Opcode.DecLocal: {
					locals[instr.arg!] = (locals[instr.arg!] as number) - 1
					break
				}

				case Opcode.DefGlobal: {
					const defName = constants[instr.arg!] as string
					this.globals.set(defName, pop())
					break
				}

				case Opcode.SetGlobal: {
					const setName = constants[instr.arg!] as string
					this.globals.set(setName, pop())
					break
				}

				case Opcode.GetGlobal: {
					const getName = constants[instr.arg!] as string
					const val = this.globals.get(getName)
					if (val === undefined) {
						throw new Error(`Неизвестная глобальная переменная: ${getName}`)
					}
					push(val)
					break
				}

				case Opcode.CreateArr: {
					const count = instr.arg!
					const items: Value[] = new Array(count)
					for (let i = count - 1; i >= 0; i--) {
						items[i] = pop()
					}
					push(items)
					break
				}

				case Opcode.GetEl: {
					const idxGet = pop()
					const collGet = pop()
					if (Array.isArray(collGet)) {
						push((collGet as VmArray)[idxGet as number] ?? null)
					}
					else if (typeof collGet === 'string') {
						push(collGet[idxGet as number] ?? null)
					}
					else {
						throw new Error('get_el: ожидался массив или строка')
					}
					break
				}

				case Opcode.SetEl: {
					const idxSet = pop()
					const arrSet = pop()
					const valSet = pop()
					if (!Array.isArray(arrSet)) {
						throw new Error('set_el: ожидался массив')
					}
					(arrSet as VmArray)[idxSet as number] = valSet
					break
				}

				default: {
					throw new Error(`Неизвестный опкод по адресу ${ip - 1}`)
				}
			}
		}

		return stack.length > 0
			? stack[stack.length - 1]
			: null
	}
}

export {
	formatValue,
	Vm,
}
