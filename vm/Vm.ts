import * as fs from 'fs'
import {type BuiltinGlobalName, BUILTIN_GLOBALS} from '../zephyr/builtins'
import {choose, match} from '../zephyr/utils'
import {
	type ClosureInstruction,
	type Instruction,
	type LocalCell,
	type Value,
	type VmArray,
	type VmClosure,
	type VmFunctionTemplate,
	type VmNative,
	type VmProgram,
	Opcode,
} from './types'

function formatValue(v: Value): string {
	if (v === null) {
		return 'null'
	}
	if (typeof v === 'object' && v !== null && 'kind' in v && v.kind === 'closure') {
		return `[closure fn#${v.template.programIndex}]`
	}
	if (typeof v === 'object' && v !== null && 'kind' in v && v.kind === 'native') {
		return `[native ${v.name}]`
	}
	if (Array.isArray(v)) {
		return `[${v.map(formatValue).join(', ')}]`
	}

	return String(v)
}

interface CallFrame {
	program: VmProgram,
	ip: number,
	locals: LocalCell[],
	closure: VmClosure | null,
}

interface VmOptions {
	read?: () => string | null,
	write?: (text: string) => void,
	writeLine?: (text: string) => void,
}

type NativeImplementation = (args: Value[]) => Value

class Vm {
	private programs: VmProgram[] = []
	private globals = new Map<string, Value>()
	private natives = new Map<BuiltinGlobalName, NativeImplementation>()
	private frames: CallFrame[] = []
	private stack: Value[] = []
	private stdinCache: string | null | undefined

	constructor(private readonly options: VmOptions = {}) {
	}

	load(programs: VmProgram[]): void {
		this.programs = programs
	}

	run(): Value {
		if (this.programs.length === 0) {
			throw new Error('Нет программы для выполнения')
		}
		const mainProgram = this.programs[0]
		this.frames = []
		this.stack = []
		this.stdinCache = undefined
		this.installBuiltins()
		this.frames.push({
			program: mainProgram,
			ip: 0,
			locals: this.makeLocals(mainProgram.localsCount),
			closure: null,
		})

		return this.runLoop()
	}

	private makeLocals(count: number): LocalCell[] {
		return Array.from({length: count}, () => ({value: null as Value}))
	}

	private runLoop(): Value {
		while (this.frames.length > 0) {
			const frame = this.frames[this.frames.length - 1]
			if (frame.ip >= frame.program.instructions.length) {
				this.frames.pop()
				if (this.frames.length > 0) {
					this.stack.push(null)
				}

				continue
			}
			const instr = frame.program.instructions[frame.ip] as Instruction
			frame.ip++

			const done = this.execInstruction(instr, frame)
			if (done !== undefined) {

				return done
			}
		}

		return this.stack.length > 0
			? this.stack[this.stack.length - 1]
			: null
	}

	private execInstruction(instr: Instruction, frame: CallFrame): Value | undefined {
		const {constants} = frame.program
		const push = (v: Value): void => {
			this.stack.push(v)
		}
		const pop = (): Value => {
			if (this.stack.length === 0) {
				throw new Error(`Стек пуст (ip=${frame.ip - 1})`)
			}

			return this.stack.pop()!
		}
		const popNum = (): number => {
			const v = pop()
			if (typeof v !== 'number') {
				throw new Error(`Ожидалось число, получено: ${typeof v}`)
			}

			return v
		}
		const popBool = (): boolean => {
			const v = pop()
			if (typeof v !== 'boolean') {
				throw new Error(`Ожидался bool, получено: ${typeof v}`)
			}

			return v
		}

		switch (instr.op) {
			case Opcode.Const: {
				const idx = instr.arg!
				const c = constants[idx]
				if (c === undefined) {
					throw new Error(`const: нет константы ${idx}`)
				}
				if (typeof c === 'object' && c !== null && 'kind' in c && c.kind === 'function') {
					throw new Error('const: нельзя загружать шаблон функции как значение')
				}
				push(c as Value)
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

			case Opcode.Eq: {
				const bEq = pop()
				const aEq = pop()
				push(aEq === bEq)
				break
			}

			case Opcode.Ne: {
				const bNe = pop()
				const aNe = pop()
				push(aNe !== bNe)
				break
			}

			case Opcode.Lt: {
				const bLt = popNum()
				push(popNum() < bLt)
				break
			}

			case Opcode.Lte: {
				const bLte = popNum()
				push(popNum() <= bLte)
				break
			}

			case Opcode.Gt: {
				const bGt = popNum()
				push(popNum() > bGt)
				break
			}

			case Opcode.Gte: {
				const bGte = popNum()
				push(popNum() >= bGte)
				break
			}

			case Opcode.And: {
				const bAnd = popBool()
				push(popBool() && bAnd)
				break
			}

			case Opcode.Or: {
				const bOr = popBool()
				push(popBool() || bOr)
				break
			}

			case Opcode.Not: {
				push(!popBool())
				break
			}

			case Opcode.Return: {
				const retVal = this.stack.length > 0
					? pop()
					: null
				this.frames.pop()
				if (this.frames.length === 0) {

					return retVal
				}
				push(retVal)

				return undefined
			}

			case Opcode.Jump: {
				frame.ip = instr.arg!

				return undefined
			}

			case Opcode.JumpIfFalse: {
				const condition = pop()
				if (condition !== true) {
					frame.ip = instr.arg!
				}
				break
			}

			case Opcode.GetLocal: {
				const slot = instr.arg!
				const cell = frame.locals[slot]
				if (cell === undefined) {
					throw new Error(`get_local: слот ${slot}`)
				}
				push(cell.value ?? null)
				break
			}

			case Opcode.SetLocal: {
				const slotSet = instr.arg!
				const cellSet = frame.locals[slotSet]
				if (cellSet === undefined) {
					throw new Error(`set_local: слот ${slotSet}`)
				}
				cellSet.value = pop()
				break
			}

			case Opcode.IncLocal: {
				const slotInc = instr.arg!
				const cellInc = frame.locals[slotInc]
				if (cellInc === undefined) {
					throw new Error(`inc_local: слот ${slotInc}`)
				}
				cellInc.value = (cellInc.value as number) + 1
				break
			}

			case Opcode.DecLocal: {
				const slotDec = instr.arg!
				const cellDec = frame.locals[slotDec]
				if (cellDec === undefined) {
					throw new Error(`dec_local: слот ${slotDec}`)
				}
				cellDec.value = (cellDec.value as number) - 1
				break
			}

			case Opcode.GetUpvalue: {
				if (frame.closure === null) {
					throw new Error('get_upvalue: нет замыкания')
				}
				const uv = frame.closure.upvalues[instr.arg!]
				if (uv === undefined) {
					throw new Error(`get_upvalue: индекс ${instr.arg}`)
				}
				push(uv.value ?? null)
				break
			}

			case Opcode.SetUpvalue: {
				if (frame.closure === null) {
					throw new Error('set_upvalue: нет замыкания')
				}
				const uvSet = frame.closure.upvalues[instr.arg!]
				if (uvSet === undefined) {
					throw new Error(`set_upvalue: индекс ${instr.arg}`)
				}
				uvSet.value = pop()
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

			case Opcode.Call: {
				const argc = instr.arg!
				const callee = pop()
				const args: Value[] = []
				for (let i = 0; i < argc; i++) {
					args.unshift(pop())
				}
				if (this.isNative(callee)) {
					this.assertNativeArity(callee, argc)
					push(this.invokeNative(callee, args))
					break
				}
				if (
					typeof callee !== 'object'
					|| callee === null
					|| !('kind' in callee)
					|| callee.kind !== 'closure'
				) {
					throw new Error('call: ожидалось замыкание')
				}
				const closure = callee as VmClosure
				const {template} = closure
				if (argc !== template.arity) {
					throw new Error(`call: ожидалось ${template.arity} аргументов, получено ${argc}`)
				}
				const program = this.programs[template.programIndex]
				if (program === undefined) {
					throw new Error(`call: нет программы #${template.programIndex}`)
				}
				const locals = this.makeLocals(program.localsCount)
				for (let i = 0; i < argc; i++) {
					locals[i].value = args[i]
				}
				this.frames.push({
					program,
					ip: 0,
					locals,
					closure,
				})
				break
			}

			case Opcode.Closure: {
				const ci = instr as ClosureInstruction
				const tplRaw = constants[ci.functionConstIndex]
				if (
					tplRaw === undefined
					|| typeof tplRaw !== 'object'
					|| tplRaw === null
					|| !('kind' in tplRaw)
					|| tplRaw.kind !== 'function'
				) {
					throw new Error('closure: ожидался шаблон функции в константах')
				}
				const template = tplRaw as VmFunctionTemplate
				const cells: LocalCell[] = []
				for (const uv of ci.upvalues) {
					if (uv.isLocal) {
						const cell = frame.locals[uv.index]
						if (cell === undefined) {
							throw new Error(`closure: локальный слот ${uv.index}`)
						}
						cells.push(cell)
					}
					else {
						if (frame.closure === null) {
							throw new Error('closure: нет внешнего замыкания')
						}
						const parentCell = frame.closure.upvalues[uv.index]
						if (parentCell === undefined) {
							throw new Error(`closure: upvalue ${uv.index}`)
						}
						cells.push(parentCell)
					}
				}
				if (cells.length !== template.upvalueCount) {
					throw new Error('closure: неверное число захватов')
				}
				push({
					kind: 'closure',
					template,
					upvalues: cells,
				})
				break
			}

			default: {
				throw new Error(`Неизвестный опкод по адресу ${frame.ip - 1}`)
			}
		}

		return undefined
	}

	private installBuiltins(): void {
		this.globals = new Map<string, Value>()
		this.natives = new Map<BuiltinGlobalName, NativeImplementation>([
			['read', () => this.readStdin()],
			['readf', args => {
				const pathValue = this.requireStringArg('readf', 0, 1, args)
				return fs.readFileSync(pathValue, 'utf-8')
			}],
			['print', args => {
				this.write(formatValue(args[0] ?? null))

				return null
			}],
			['printf', args => {
				const filePath = this.requireStringArg('printf', 0, 2, args)
				const content = formatValue(args[1] ?? null)
				fs.writeFileSync(filePath, content)

				return null
			}],
		])

		for (const name of BUILTIN_GLOBALS) {
			const nativeConfig = match(name, {
				print: {
					arity: 1,
					minArity: 1,
				},
				readf: {
					arity: 1,
					minArity: 1,
				},
				printf: {
					arity: 2,
					minArity: 2,
				},
				read: {
					arity: 0,
					minArity: 0,
				},
			})
			const nativeValue: VmNative = {
				kind: 'native',
				name,
				arity: nativeConfig.arity,
				minArity: nativeConfig.minArity,
			}
			this.globals.set(name, nativeValue)
		}
	}

	private isNative(value: Value): value is VmNative {
		return typeof value === 'object'
			&& value !== null
			&& 'kind' in value
			&& value.kind === 'native'
	}

	private assertNativeArity(nativeFn: VmNative, argc: number): void {
		const exactArityError = choose(
			[
				nativeFn.arity !== null && argc !== nativeFn.arity,
				`call ${nativeFn.name}: ожидалось ${nativeFn.arity} аргументов, получено ${argc}`,
			],
			null,
		)
		if (exactArityError !== null) {
			throw new Error(exactArityError)
		}
		const minArityError = choose(
			[
				argc < nativeFn.minArity,
				`call ${nativeFn.name}: ожидалось минимум ${nativeFn.minArity} аргументов, получено ${argc}`,
			],
			null,
		)
		if (minArityError !== null) {
			throw new Error(minArityError)
		}
	}

	private invokeNative(nativeFn: VmNative, args: Value[]): Value {
		const implementation = this.natives.get(nativeFn.name as BuiltinGlobalName)
		if (implementation === undefined) {
			throw new Error(`Неизвестная встроенная функция: ${nativeFn.name}`)
		}

		return implementation(args)
	}

	private readStdin(): string | null {
		if (this.options.read !== undefined) {
			return this.options.read()
		}
		if (this.stdinCache === undefined) {
			this.stdinCache = fs.readFileSync(0, 'utf-8')
		}
		if (this.stdinCache === null) {
			return null
		}
		const value = this.stdinCache
		this.stdinCache = null

		return value
	}

	private requireStringArg(name: string, index: number, argc: number, args?: Value[]): string {
		const values = args ?? []
		const value = values[index]
		if (typeof value !== 'string') {
			throw new Error(`${name}: аргумент ${index + 1} из ${argc} должен быть строкой`)
		}

		return value
	}

	private write(text: string): void {
		if (this.options.write !== undefined) {
			this.options.write(text)

			return
		}
		process.stdout.write(text)
	}
}

export {
	formatValue,
	Vm,
}
