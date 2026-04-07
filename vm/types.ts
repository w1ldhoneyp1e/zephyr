
type VmArray = Value[]

interface LocalCell {
	value: Value,
}

interface VmFunctionTemplate {
	kind: 'function',
	programIndex: number,
	arity: number,
	upvalueCount: number,
}

interface VmClosure {
	kind: 'closure',
	template: VmFunctionTemplate,
	upvalues: LocalCell[],
}

type Value = null | number | boolean | string | VmArray | VmClosure

type ConstantPoolItem = Value | VmFunctionTemplate

interface VmProgram {
	name: string,
	argc: number,
	localsCount: number,
	constants: ConstantPoolItem[],
	instructions: Instruction[],
}

enum Opcode {
	Const = 'const',
	True = 'true',
	False = 'false',
	Nil = 'nil',
	Pop = 'pop',

	Add = 'add',
	Sub = 'sub',
	Mul = 'mul',
	Div = 'div',
	Mod = 'mod',
	Neg = 'neg',
	Eq = 'eq',
	Ne = 'ne',
	Lt = 'lt',
	Lte = 'lte',
	Gt = 'gt',
	Gte = 'gte',
	And = 'and',
	Or = 'or',
	Not = 'not',

	Return = 'return',
	Jump = 'jump',
	JumpIfFalse = 'jump_if_false',

	GetLocal = 'get_local',
	SetLocal = 'set_local',
	IncLocal = 'inc_local',
	DecLocal = 'dec_local',

	GetUpvalue = 'get_upvalue',
	SetUpvalue = 'set_upvalue',

	DefGlobal = 'def_global',
	SetGlobal = 'set_global',
	GetGlobal = 'get_global',

	CreateArr = 'create_arr',
	GetEl = 'get_el',
	SetEl = 'set_el',

	Call = 'call',
	Closure = 'closure',
}

type NoArgOpcode =
	| Opcode.True | Opcode.False | Opcode.Nil | Opcode.Pop
	| Opcode.Add | Opcode.Sub | Opcode.Mul | Opcode.Div | Opcode.Mod | Opcode.Neg
	| Opcode.Eq | Opcode.Ne | Opcode.Lt | Opcode.Lte | Opcode.Gt | Opcode.Gte
	| Opcode.And | Opcode.Or | Opcode.Not
	| Opcode.Return | Opcode.GetEl | Opcode.SetEl

type NumArgOpcode =
	| Opcode.Const
	| Opcode.Jump | Opcode.JumpIfFalse
	| Opcode.GetLocal | Opcode.SetLocal | Opcode.IncLocal | Opcode.DecLocal
	| Opcode.GetUpvalue | Opcode.SetUpvalue
	| Opcode.DefGlobal | Opcode.SetGlobal | Opcode.GetGlobal
	| Opcode.CreateArr
	| Opcode.Call

interface NoArgInstruction {
	op: NoArgOpcode,
}

interface NumArgInstruction {
	op: NumArgOpcode,
	arg: number,
}

interface ClosureInstruction {
	op: Opcode.Closure,
	functionConstIndex: number,
	upvalues: {
		isLocal: boolean,
		index: number,
	}[],
}

type Instruction = NoArgInstruction | NumArgInstruction | ClosureInstruction

export {
	LocalCell,
	VmFunctionTemplate,
	VmClosure,
	VmArray,
	VmProgram,
	Value,
	ConstantPoolItem,
	Opcode,
	NoArgOpcode,
	NumArgOpcode,
	NoArgInstruction,
	NumArgInstruction,
	ClosureInstruction,
	Instruction,
}
