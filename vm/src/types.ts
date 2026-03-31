/* eslint-disable @typescript-eslint/naming-convention */
type VmArray = Value[]

type Value = null | number | boolean | string | VmArray

interface VmProgram {
	name: string,
	argc: number,
	localsCount: number,
	constants: Value[],
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

	Return = 'return',

	GetLocal = 'get_local',
	SetLocal = 'set_local',
	IncLocal = 'inc_local',
	DecLocal = 'dec_local',

	DefGlobal = 'def_global',
	SetGlobal = 'set_global',
	GetGlobal = 'get_global',

	CreateArr = 'create_arr',
	GetEl = 'get_el',
	SetEl = 'set_el',
}

type NoArgOpcode =
	| Opcode.True | Opcode.False | Opcode.Nil | Opcode.Pop
	| Opcode.Add | Opcode.Sub | Opcode.Mul | Opcode.Div | Opcode.Mod | Opcode.Neg
	| Opcode.Return | Opcode.GetEl | Opcode.SetEl

type NumArgOpcode =
	| Opcode.Const
	| Opcode.GetLocal | Opcode.SetLocal | Opcode.IncLocal | Opcode.DecLocal
	| Opcode.DefGlobal | Opcode.SetGlobal | Opcode.GetGlobal
	| Opcode.CreateArr

interface NoArgInstruction {
	op: NoArgOpcode,
}

interface NumArgInstruction {
	op: NumArgOpcode,
	arg: number,
}

type Instruction = NoArgInstruction | NumArgInstruction

export {
	VmArray,
	VmProgram,
	Value,
	Opcode,
	NoArgOpcode,
	NumArgOpcode,
	NoArgInstruction,
	NumArgInstruction,
	Instruction,
}
