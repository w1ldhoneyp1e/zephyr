import * as fs from 'fs'
import {type BuiltinGlobalName} from '../zephyr/builtins'
import {type NativeImplementation, createNativeRegistry} from './nativeRuntime'
import {execCallableOpcode} from './opcodes/callables'
import {execCollectionOpcode} from './opcodes/collections'
import {type CallFrame, type VmRuntimeContext} from './opcodes/context'
import {execControlFlowOpcode} from './opcodes/controlFlow'
import {execScalarOpcode} from './opcodes/scalar'
import {execScopeOpcode} from './opcodes/scope'
import {
	type Instruction,
	type LocalCell,
	type Value,
	type VmProgram,
} from './types'

interface VmOptions {
	read?: () => string | null,
	write?: (text: string) => void,
	writeLine?: (text: string) => void,
}

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

		const runtime: VmRuntimeContext = {
			constants,
			push,
			pop,
			popNum,
			popBool,
		}

		const scalarResult = execScalarOpcode(instr, runtime)
		if (scalarResult !== null) {
			return scalarResult
		}

		const controlResult = execControlFlowOpcode(
			instr,
			frame,
			runtime,
			{
				frameCount: this.frames.length,
				popFrame: () => this.frames.pop(),
			},
		)
		if (controlResult.handled) {
			return controlResult.value
		}

		if (execScopeOpcode(instr, frame, runtime, this.globals)) {
			return undefined
		}

		if (execCollectionOpcode(instr, runtime)) {
			return undefined
		}

		if (execCallableOpcode(
			instr,
			frame,
			runtime,
			{
				natives: this.natives,
				programs: this.programs,
				makeLocals: count => this.makeLocals(count),
				pushFrame: nextFrame => this.frames.push(nextFrame),
			},
		)) {
			return undefined
		}

		throw new Error(`Неизвестный опкод по адресу ${frame.ip - 1}`)
	}

	private installBuiltins(): void {
		const registry = createNativeRegistry({
			read: () => this.readStdin(),
			write: text => this.write(text),
		})
		this.globals = registry.globals
		this.natives = registry.natives
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

	private write(text: string): void {
		if (this.options.write !== undefined) {
			this.options.write(text)

			return
		}
		process.stdout.write(text)
	}
}

export {
	Vm,
}
