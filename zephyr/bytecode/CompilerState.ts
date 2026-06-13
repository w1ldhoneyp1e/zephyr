import {
	type ClassDeclarationNode,
	type ConstructorDeclarationNode,
	type ForStatementNode,
	type ForRangeStatementNode,
	type FunctionDeclarationNode,
	type IdentifierExpressionNode,
	type IdentifierTargetNode,
	type LambdaExpressionNode,
	type MethodDeclarationNode,
	type TypeAliasDeclarationNode,
	type VariableDeclarationNode,
} from '../ast'
import {type NodeLocations, type SourceLocation} from '../diagnostics'
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
	type VmSourceLocation,
	Opcode,
} from './context'
import {compilerInvariant} from './errors'

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
	private debugLocations: (VmSourceLocation | null)[] = []
	private currentLocation: SourceLocation | null = null

	constructor(
		private readonly parent: CompilerState | null,
		private readonly fnName: string,
		private readonly arity: number,
		private readonly model: SemanticModel,
		private readonly nodeLocations: NodeLocations,
	) {
	}

	buildVmProgram(): VmProgram {
		return {
			name: this.fnName,
			argc: this.arity,
			localsCount: this.localCount,
			constants: this.constants,
			instructions: this.instructions,
			debugLocations: this.debugLocations,
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
			compilerInvariant('unexpected scope exit')
		}
		for (const name of scope.locals) {
			this.localSlots.delete(name)
		}
	}

	declareBinding(binding: SemanticBinding): number {
		if (this.localSlots.has(binding)) {
			compilerInvariant(`binding is already declared in current function: ${getBindingName(binding)}`)
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
			compilerInvariant(`immutable binding reached assignment emitter: ${getBindingName(binding)}`)
		}
	}

	resolve(binding: SemanticBinding): ResolvedBinding {
		if (binding.kind === 'narrowed') {
			return this.resolve(binding.original)
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
		compilerInvariant(`binding is not available in compiler state: ${getBindingName(binding)}`)
	}

	resolveExpressionBinding(binding: SemanticBinding): ResolvedExpressionBinding {
		if (binding.kind === 'narrowed') {
			return this.resolveExpressionBinding(binding.original)
		}
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
		compilerInvariant(`expression binding is not available in compiler state: ${getBindingName(binding)}`)
	}

	addConstant(value: Value | VmFunctionTemplate): number {
		this.constants.push(value)

		return this.constants.length - 1
	}

	emitNoArg(op: NoArgOpcode): void {
		this.instructions.push({op})
		this.recordDebugLocation()
	}

	emitNumArg(op: NumArgOpcode, arg: number): void {
		this.instructions.push({
			op,
			arg,
		})
		this.recordDebugLocation()
	}

	emitClosureInstr(functionConstIndex: number, ups: UpvalueDescriptor[]): void {
		const instr: ClosureInstruction = {
			op: Opcode.Closure,
			functionConstIndex,
			upvalues: ups,
		}
		this.instructions.push(instr)
		this.recordDebugLocation()
	}

	withNodeLocation<TResult>(node: object, callback: () => TResult): TResult {
		const previousLocation = this.currentLocation
		const nextLocation = this.nodeLocations.get(node)
		if (nextLocation !== null) {
			this.currentLocation = nextLocation
		}
		try {
			return callback()
		}
		finally {
			this.currentLocation = previousLocation
		}
	}

	emitJump(op: Opcode.Jump | Opcode.JumpIfFalse): number {
		const pos = this.instructions.length
		this.emitNumArg(op, -1)

		return pos
	}

	patchJump(position: number, target: number): void {
		const instruction = this.instructions[position]
		if (instruction === undefined || !('arg' in instruction)) {
			compilerInvariant('cannot patch jump instruction')
		}
		instruction.arg = target
	}

	getDeclarationBinding(
		name: VariableDeclarationNode | TypeAliasDeclarationNode | FunctionDeclarationNode | ClassDeclarationNode,
	): SemanticBinding {
		const binding = this.model.declarationBindings.get(name)
		if (binding === undefined) {
			compilerInvariant('declaration binding not found')
		}

		return binding
	}

	getClassBaseBinding(name: ClassDeclarationNode): ClassSemanticBinding | null {
		return this.model.classBaseBindings.get(name) ?? null
	}

	getFunctionParameterBindings(name:
			| FunctionDeclarationNode
			| MethodDeclarationNode
			| ConstructorDeclarationNode
			| LambdaExpressionNode,
	): SemanticBinding[] {
		const bindings = this.model.functionParameterBindings.get(name)
		if (bindings === undefined) {
			compilerInvariant('function parameter bindings not found')
		}

		return bindings
	}

	getForRangeBinding(statement: ForRangeStatementNode | ForStatementNode): SemanticBinding {
		const binding = this.model.forRangeBindings.get(statement)
		if (binding === undefined) {
			compilerInvariant('for-range binding not found')
		}

		return binding
	}

	getExpressionBinding(name: IdentifierExpressionNode): SemanticBinding {
		const binding = this.model.identifierBindings.get(name)
		if (binding === undefined) {
			compilerInvariant('identifier binding not found')
		}

		return binding
	}

	getAssignmentTargetBinding(name: IdentifierTargetNode): SemanticBinding {
		const binding = this.model.assignmentTargetBindings.get(name)
		if (binding === undefined) {
			compilerInvariant('assignment target binding not found')
		}

		return binding
	}

	getMethodReceiverBinding(name: MethodDeclarationNode | ConstructorDeclarationNode): ClassSemanticBinding {
		const binding = this.model.methodReceiverBindings.get(name)
		if (binding === undefined) {
			compilerInvariant('method receiver binding not found')
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
			compilerInvariant('current scope is missing')
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

	private recordDebugLocation(): void {
		this.debugLocations.push(this.currentLocation)
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
