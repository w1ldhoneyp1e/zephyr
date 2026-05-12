import {isBuiltinGlobalName} from '../builtins'
import {
	type ClosureInstruction,
	type ConstantPoolItem,
	type Instruction,
	type NoArgOpcode,
	type NumArgOpcode,
	type ResolvedBinding,
	type ResolvedExpressionBinding,
	type ScopeInfo,
	type UpvalueDescriptor,
	type Value,
	type VmFunctionTemplate,
	type VmProgram,
	Opcode,
} from './context'

class CompilerState {
	private constants: ConstantPoolItem[] = []
	private instructions: Instruction[] = []
	private localSlots = new Map<string, number>()
	private constBindings = new Set<string>()
	private localCount = 0
	private scopes: ScopeInfo[] = []
	private upvalues: UpvalueDescriptor[] = []
	private upvalueDedup = new Map<string, number>()

	constructor(
		private readonly parent: CompilerState | null,
		private readonly fnName: string,
		private readonly arity: number,
	) {
	}

	buildVmProgram(): VmProgram {
		return {
			name: this.fnName,
			argc: this.arity,
			localsCount: this.localCount,
			constants: this.constants,
			instructions: this.instructions,
		}
	}

	getInstructions(): Instruction[] {
		return this.instructions
	}

	getUpvalues(): UpvalueDescriptor[] {
		return this.upvalues
	}

	enterScope(): void {
		this.scopes.push({locals: new Set()})
	}

	leaveScope(): void {
		const scope = this.scopes.pop()
		if (scope === undefined) {
			throw new Error('Неожиданный выход из scope')
		}
		for (const name of scope.locals) {
			this.localSlots.delete(name)
			this.constBindings.delete(name)
		}
	}

	declareLocal(name: string, isConst: boolean): number {
		if (this.localSlots.has(name)) {
			throw new Error(`Повторное объявление переменной: ${name}`)
		}
		const slot = this.localCount
		this.localCount++
		this.localSlots.set(name, slot)
		if (isConst) {
			this.constBindings.add(name)
		}
		this.scopes[this.scopes.length - 1].locals.add(name)

		return slot
	}

	assertMutable(name: string): void {
		if (this.constBindings.has(name)) {
			throw new Error(`Нельзя присвоить const переменной: ${name}`)
		}
	}

	resolve(name: string): ResolvedBinding {
		const slot = this.resolveLocal(name)
		if (slot !== -1) {
			return {
				kind: 'local',
				slot,
			}
		}
		const upvalue = this.resolveUpvalue(name)
		if (upvalue !== -1) {
			return {
				kind: 'upvalue',
				index: upvalue,
			}
		}
		throw new Error(`Неизвестная переменная: ${name}`)
	}

	resolveExpressionBinding(name: string): ResolvedExpressionBinding {
		const slot = this.resolveLocal(name)
		if (slot !== -1) {
			return {
				kind: 'local',
				slot,
			}
		}
		const upvalue = this.resolveUpvalue(name)
		if (upvalue !== -1) {
			return {
				kind: 'upvalue',
				index: upvalue,
			}
		}
		if (isBuiltinGlobalName(name)) {
			return {
				kind: 'global',
				name,
			}
		}
		throw new Error(`Неизвестная переменная: ${name}`)
	}

	addConstant(value: Value | VmFunctionTemplate): number {
		this.constants.push(value)

		return this.constants.length - 1
	}

	emitNoArg(op: NoArgOpcode): void {
		this.instructions.push({op})
	}

	emitNumArg(op: NumArgOpcode, arg: number): void {
		this.instructions.push({
			op,
			arg,
		})
	}

	emitClosureInstr(functionConstIndex: number, ups: UpvalueDescriptor[]): void {
		const instr: ClosureInstruction = {
			op: Opcode.Closure,
			functionConstIndex,
			upvalues: ups,
		}
		this.instructions.push(instr)
	}

	emitJump(op: Opcode.Jump | Opcode.JumpIfFalse): number {
		const pos = this.instructions.length
		this.emitNumArg(op, -1)

		return pos
	}

	patchJump(position: number, target: number): void {
		const instruction = this.instructions[position]
		if (instruction === undefined || !('arg' in instruction)) {
			throw new Error('Невозможно пропатчить jump')
		}
		instruction.arg = target
	}

	private resolveLocal(name: string): number {
		const slot = this.localSlots.get(name)

		return slot === undefined
			? -1
			: slot
	}

	private addUpvalue(desc: UpvalueDescriptor): number {
		const key = `${desc.isLocal}:${desc.index}`
		const existing = this.upvalueDedup.get(key)
		if (existing !== undefined) {
			return existing
		}
		const idx = this.upvalues.length
		this.upvalues.push(desc)
		this.upvalueDedup.set(key, idx)

		return idx
	}

	private resolveUpvalue(name: string): number {
		if (this.parent === null) {
			return -1
		}
		const localSlot = this.parent.resolveLocal(name)
		if (localSlot !== -1) {
			return this.addUpvalue({
				isLocal: true,
				index: localSlot,
			})
		}
		const parentUv = this.parent.resolveUpvalue(name)
		if (parentUv !== -1) {
			return this.addUpvalue({
				isLocal: false,
				index: parentUv,
			})
		}

		return -1
	}
}

export {
	CompilerState,
}
