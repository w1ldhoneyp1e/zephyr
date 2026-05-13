import {
	type ClassDeclarationNode,
	type ForRangeStatementNode,
	type FunctionDeclarationNode,
	type IdentifierExpressionNode,
	type IdentifierTargetNode,
	type MethodDeclarationNode,
	type VariableDeclarationNode,
} from '../ast'
import {
	type ClassSemanticBinding,
	type SemanticBinding,
	type SemanticModel,
	getBindingName,
	isBindingMutable,
} from '../semantics/context'
import {
	type ClosureInstruction,
	type ConstantPoolItem,
	type Instruction,
	type NoArgOpcode,
	type NumArgOpcode,
	type ResolvedBinding,
	type ResolvedExpressionBinding,
	type UpvalueDescriptor,
	type Value,
	type VmFunctionTemplate,
	type VmProgram,
	Opcode,
} from './context'

interface CompilerScopeInfo {
	locals: Set<CompilerBinding>,
}

interface InternalCompilerBinding {
	kind: 'internal',
	name: string,
}

type CompilerBinding = SemanticBinding | InternalCompilerBinding

class CompilerState {
	private constants: ConstantPoolItem[] = []
	private instructions: Instruction[] = []
	private localSlots = new Map<CompilerBinding, number>()
	private localCount = 0
	private scopes: CompilerScopeInfo[] = []
	private upvalues: UpvalueDescriptor[] = []
	private upvalueDedup = new Map<string, number>()

	constructor(
		private readonly parent: CompilerState | null,
		private readonly fnName: string,
		private readonly arity: number,
		private readonly model: SemanticModel,
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
		}
	}

	declareBinding(binding: SemanticBinding): number {
		if (this.localSlots.has(binding)) {
			throw new Error(`Повторное объявление переменной: ${getBindingName(binding)}`)
		}
		const slot = this.localCount
		this.localCount++
		this.localSlots.set(binding, slot)
		this.getCurrentScope().locals.add(binding)

		return slot
	}

	declareInternalLocal(name: string): number {
		const binding: InternalCompilerBinding = {
			kind: 'internal',
			name,
		}
		const slot = this.localCount
		this.localCount++
		this.localSlots.set(binding, slot)
		this.getCurrentScope().locals.add(binding)

		return slot
	}

	assertMutable(binding: SemanticBinding): void {
		if (!isBindingMutable(binding)) {
			throw new Error(`Нельзя присвоить значение имени: ${getBindingName(binding)}`)
		}
	}

	resolve(binding: SemanticBinding): ResolvedBinding {
		const slot = this.resolveLocal(binding)
		if (slot !== -1) {
			return {
				kind: 'local',
				slot,
			}
		}
		const upvalue = this.resolveUpvalue(binding)
		if (upvalue !== -1) {
			return {
				kind: 'upvalue',
				index: upvalue,
			}
		}
		throw new Error(`Неизвестная переменная: ${getBindingName(binding)}`)
	}

	resolveExpressionBinding(binding: SemanticBinding): ResolvedExpressionBinding {
		if (binding.kind === 'builtin') {
			return {
				kind: 'global',
				name: binding.name,
			}
		}
		const slot = this.resolveLocal(binding)
		if (slot !== -1) {
			return {
				kind: 'local',
				slot,
			}
		}
		const upvalue = this.resolveUpvalue(binding)
		if (upvalue !== -1) {
			return {
				kind: 'upvalue',
				index: upvalue,
			}
		}
		throw new Error(`Неизвестная переменная: ${getBindingName(binding)}`)
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

	getDeclarationBinding(
		name: VariableDeclarationNode | FunctionDeclarationNode | ClassDeclarationNode,
	): SemanticBinding {
		const binding = this.model.declarationBindings.get(name)
		if (binding === undefined) {
			throw new Error('CompilerState: declaration binding not found')
		}

		return binding
	}

	getFunctionParameterBindings(name: FunctionDeclarationNode | MethodDeclarationNode): SemanticBinding[] {
		const bindings = this.model.functionParameterBindings.get(name)
		if (bindings === undefined) {
			throw new Error('CompilerState: function parameter bindings not found')
		}

		return bindings
	}

	getForRangeBinding(statement: ForRangeStatementNode): SemanticBinding {
		const binding = this.model.forRangeBindings.get(statement)
		if (binding === undefined) {
			throw new Error('CompilerState: for-range binding not found')
		}

		return binding
	}

	getExpressionBinding(name: IdentifierExpressionNode): SemanticBinding {
		const binding = this.model.identifierBindings.get(name)
		if (binding === undefined) {
			throw new Error('CompilerState: identifier binding not found')
		}

		return binding
	}

	getAssignmentTargetBinding(name: IdentifierTargetNode): SemanticBinding {
		const binding = this.model.assignmentTargetBindings.get(name)
		if (binding === undefined) {
			throw new Error('CompilerState: assignment target binding not found')
		}

		return binding
	}

	getMethodReceiverBinding(name: MethodDeclarationNode): ClassSemanticBinding {
		const binding = this.model.methodReceiverBindings.get(name)
		if (binding === undefined) {
			throw new Error('CompilerState: method receiver binding not found')
		}

		return binding
	}

	private resolveLocal(binding: SemanticBinding): number {
		const slot = this.localSlots.get(binding)

		return slot === undefined
			? -1
			: slot
	}

	private getCurrentScope(): CompilerScopeInfo {
		const scope = this.scopes[this.scopes.length - 1]
		if (scope === undefined) {
			throw new Error('CompilerState: отсутствует текущий scope')
		}

		return scope
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

	private resolveUpvalue(binding: SemanticBinding): number {
		if (this.parent === null) {
			return -1
		}
		const localSlot = this.parent.resolveLocal(binding)
		if (localSlot !== -1) {
			return this.addUpvalue({
				isLocal: true,
				index: localSlot,
			})
		}
		const parentUv = this.parent.resolveUpvalue(binding)
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
