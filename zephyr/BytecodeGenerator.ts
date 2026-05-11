import {
	type ClosureInstruction,
	type ConstantPoolItem,
	type Instruction,
	type NoArgOpcode,
	type NumArgOpcode,
	type Value,
	type VmFunctionTemplate,
	type VmProgram,
	Opcode,
} from '../vm/types'
import {
	type AssignmentStatementNode,
	type ExpressionNode,
	type ForRangeStatementNode,
	type FunctionDeclarationNode,
	type ProgramNode,
	type StatementNode,
} from './ast'

interface ScopeInfo {
	locals: Set<string>,
}

class BytecodeGenerator {
	functionPrograms: VmProgram[] = []

	generate(program: ProgramNode): VmProgram[] {
		this.functionPrograms = []
		const main = new FunctionCompiler(this, null, '__main__', 0)
		main.enterScope()
		for (const statement of program.body) {
			main.emitStatement(statement)
		}
		main.emitNilReturn()
		main.leaveScope()
		const mainVm = main.buildVmProgram()

		return [mainVm, ...this.functionPrograms]
	}
}

class FunctionCompiler {
	private constants: ConstantPoolItem[] = []
	private instructions: Instruction[] = []
	private localSlots = new Map<string, number>()
	private constBindings = new Set<string>()
	private localCount = 0
	private scopes: ScopeInfo[] = []
	private upvalues: {
		isLocal: boolean,
		index: number,
	}[] = []
	private upvalueDedup = new Map<string, number>()

	constructor(
		private readonly generator: BytecodeGenerator,
		private readonly parent: FunctionCompiler | null,
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

	private resolveLocal(name: string): number {
		const slot = this.localSlots.get(name)

		return slot === undefined
			? -1
			: slot
	}

	private addUpvalue(desc: {
		isLocal: boolean,
		index: number,
	}): number {
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

	private resolve(name: string): {
		kind: 'local',
		slot: number,
	} | {
		kind: 'upvalue',
		index: number,
	} {
		const slot = this.resolveLocal(name)
		if (slot !== -1) {

			return {
				kind: 'local',
				slot,
			}
		}
		const uv = this.resolveUpvalue(name)
		if (uv !== -1) {

			return {
				kind: 'upvalue',
				index: uv,
			}
		}
		throw new Error(`Неизвестная переменная: ${name}`)
	}

	emitNilReturn(): void {
		this.emitNoArg(Opcode.Nil)
		this.emitNoArg(Opcode.Return)
	}

	private emitFunctionDeclaration(node: FunctionDeclarationNode): void {
		const slot = this.declareLocal(node.name, true)
		const nested = new FunctionCompiler(this.generator, this, node.name, node.params.length)
		nested.enterScope()
		for (const param of node.params) {
			nested.declareLocal(param, false)
		}
		nested.emitBlock(node.body.statements)
		nested.emitNilReturn()
		nested.leaveScope()
		const prog = nested.buildVmProgram()
		this.generator.functionPrograms.push(prog)
		const programIndex = this.generator.functionPrograms.length
		const tmpl: VmFunctionTemplate = {
			kind: 'function',
			programIndex,
			arity: node.params.length,
			upvalueCount: nested.upvalues.length,
		}
		const constIdx = this.addConstant(tmpl)
		this.emitClosureInstr(constIdx, nested.upvalues)
		this.emitNumArg(Opcode.SetLocal, slot)
	}

	emitStatement(statement: StatementNode): void {
		switch (statement.type) {
			case 'VariableDeclaration': {
				const slot = this.declareLocal(statement.name, statement.kind === 'const')
				if (statement.initializer !== null) {
					this.emitExpression(statement.initializer)
				}
				else {
					this.emitNoArg(Opcode.Nil)
				}
				this.emitNumArg(Opcode.SetLocal, slot)
				break
			}
			case 'AssignmentStatement': {
				this.emitAssignment(statement)
				break
			}
			case 'ExpressionStatement': {
				this.emitExpression(statement.expression)
				this.emitNoArg(Opcode.Pop)
				break
			}
			case 'IfStatement': {
				this.emitExpression(statement.condition)
				const elseJump = this.emitJump(Opcode.JumpIfFalse)
				this.emitBlock(statement.thenBranch.statements)
				if (statement.elseBranch !== null) {
					const endJump = this.emitJump(Opcode.Jump)
					this.patchJump(elseJump, this.instructions.length)
					this.emitBlock(statement.elseBranch.statements)
					this.patchJump(endJump, this.instructions.length)
				}
				else {
					this.patchJump(elseJump, this.instructions.length)
				}
				break
			}
			case 'WhileStatement': {
				const loopStart = this.instructions.length
				this.emitExpression(statement.condition)
				const endJump = this.emitJump(Opcode.JumpIfFalse)
				this.emitBlock(statement.body.statements)
				this.emitNumArg(Opcode.Jump, loopStart)
				this.patchJump(endJump, this.instructions.length)
				break
			}
			case 'ForRangeStatement': {
				this.emitForRange(statement)
				break
			}
			case 'ReturnStatement': {
				if (statement.value !== null) {
					this.emitExpression(statement.value)
				}
				else {
					this.emitNoArg(Opcode.Nil)
				}
				this.emitNoArg(Opcode.Return)
				break
			}
			case 'BlockStatement': {
				this.emitBlock(statement.statements)
				break
			}
			case 'FunctionDeclaration': {
				this.emitFunctionDeclaration(statement)
				break
			}
			default: {
				throw new Error(`Неподдерживаемый statement: ${(statement as {type: string}).type}`)
			}
		}
	}

	private emitForRange(statement: ForRangeStatementNode): void {
		this.enterScope()
		const iteratorSlot = this.declareLocal(statement.iterator, false)
		this.emitExpression(statement.start)
		this.emitNumArg(Opcode.SetLocal, iteratorSlot)
		const endName = `__for_end_${iteratorSlot}_${this.instructions.length}`
		const endSlot = this.declareLocal(endName, true)
		this.emitExpression(statement.end)
		this.emitNumArg(Opcode.SetLocal, endSlot)
		const loopStart = this.instructions.length
		this.emitNumArg(Opcode.GetLocal, iteratorSlot)
		this.emitNumArg(Opcode.GetLocal, endSlot)
		this.emitNoArg(Opcode.Lt)
		const endJump = this.emitJump(Opcode.JumpIfFalse)
		this.emitBlock(statement.body.statements)
		this.emitNumArg(Opcode.IncLocal, iteratorSlot)
		this.emitNumArg(Opcode.Jump, loopStart)
		this.patchJump(endJump, this.instructions.length)
		this.leaveScope()
	}

	private emitAssignment(statement: AssignmentStatementNode): void {
		if (statement.target.type === 'IdentifierTarget') {
			this.assertMutable(statement.target.name)
			const resolved = this.resolve(statement.target.name)
			this.emitExpression(statement.value)
			if (resolved.kind === 'local') {
				this.emitNumArg(Opcode.SetLocal, resolved.slot)
			}
			else {
				this.emitNumArg(Opcode.SetUpvalue, resolved.index)
			}

			return
		}
		if (statement.target.type === 'IndexTarget') {
			this.emitExpression(statement.value)
			this.emitExpression(statement.target.object)
			this.emitExpression(statement.target.index)
			this.emitNoArg(Opcode.SetEl)

			return
		}
		throw new Error('Неподдерживаемая цель присваивания')
	}

	private emitBlock(statements: StatementNode[]): void {
		this.enterScope()
		for (const statement of statements) {
			this.emitStatement(statement)
		}
		this.leaveScope()
	}

	private emitExpression(expression: ExpressionNode): void {
		switch (expression.type) {
			case 'LiteralExpression': {
				if (expression.value === null) {
					this.emitNoArg(Opcode.Nil)
				}
				else if (expression.value === true) {
					this.emitNoArg(Opcode.True)
				}
				else if (expression.value === false) {
					this.emitNoArg(Opcode.False)
				}
				else {
					const idx = this.addConstant(expression.value as Value)
					this.emitNumArg(Opcode.Const, idx)
				}
				break
			}
			case 'IdentifierExpression': {
				const resolved = this.resolve(expression.name)
				if (resolved.kind === 'local') {
					this.emitNumArg(Opcode.GetLocal, resolved.slot)
				}
				else {
					this.emitNumArg(Opcode.GetUpvalue, resolved.index)
				}
				break
			}
			case 'UnaryExpression': {
				this.emitExpression(expression.argument)
				if (expression.operator === '-') {
					this.emitNoArg(Opcode.Neg)
				}
				else if (expression.operator === '!') {
					this.emitNoArg(Opcode.Not)
				}
				else {
					throw new Error(`Неподдерживаемый унарный оператор: ${expression.operator}`)
				}
				break
			}
			case 'BinaryExpression': {
				this.emitExpression(expression.left)
				this.emitExpression(expression.right)
				const opMap: Record<string, NoArgOpcode> = {
					'+': Opcode.Add,
					'-': Opcode.Sub,
					'*': Opcode.Mul,
					'/': Opcode.Div,
					'%': Opcode.Mod,
					'==': Opcode.Eq,
					'!=': Opcode.Ne,
					'<': Opcode.Lt,
					'<=': Opcode.Lte,
					'>': Opcode.Gt,
					'>=': Opcode.Gte,
					'&&': Opcode.And,
					'||': Opcode.Or,
				}
				const opcode = opMap[expression.operator]
				if (opcode === undefined) {
					throw new Error(`Неподдерживаемый бинарный оператор: ${expression.operator}`)
				}
				this.emitNoArg(opcode)
				break
			}
			case 'ArrayExpression': {
				for (const element of expression.elements) {
					this.emitExpression(element)
				}
				this.emitNumArg(Opcode.CreateArr, expression.elements.length)
				break
			}
			case 'IndexExpression': {
				this.emitExpression(expression.object)
				this.emitExpression(expression.index)
				this.emitNoArg(Opcode.GetEl)
				break
			}
			case 'CallExpression': {
				const argc = expression.args.length
				for (const arg of expression.args) {
					this.emitExpression(arg)
				}
				this.emitExpression(expression.callee)
				this.emitNumArg(Opcode.Call, argc)
				break
			}
			default: {
				throw new Error(`Неподдерживаемое выражение: ${(expression as {type: string}).type}`)
			}
		}
	}

	private addConstant(value: Value | VmFunctionTemplate): number {
		this.constants.push(value)

		return this.constants.length - 1
	}

	private emitNoArg(op: NoArgOpcode): void {
		this.instructions.push({op})
	}

	private emitNumArg(op: NumArgOpcode, arg: number): void {
		this.instructions.push({
			op,
			arg,
		})
	}

	private emitClosureInstr(functionConstIndex: number, ups: {
		isLocal: boolean,
		index: number,
	}[]): void {
		const instr: ClosureInstruction = {
			op: Opcode.Closure,
			functionConstIndex,
			upvalues: ups,
		}
		this.instructions.push(instr)
	}

	private emitJump(op: Opcode.Jump | Opcode.JumpIfFalse): number {
		const pos = this.instructions.length
		this.emitNumArg(op, -1)

		return pos
	}

	private patchJump(position: number, target: number): void {
		const instruction = this.instructions[position]
		if (instruction === undefined || !('arg' in instruction)) {
			throw new Error('Невозможно пропатчить jump')
		}
		instruction.arg = target
	}

	private declareLocal(name: string, isConst: boolean): number {
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

	private assertMutable(name: string): void {
		if (this.constBindings.has(name)) {
			throw new Error(`Нельзя присвоить const переменной: ${name}`)
		}
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
}

export {
	BytecodeGenerator,
}
