import {
	type ClosureInstruction,
	type Instruction,
	type LocalCell,
	type Value,
	type VmClosure,
	type VmProgram,
} from '../types'

interface CallFrame {
	program: VmProgram,
	ip: number,
	locals: LocalCell[],
	closure: VmClosure | null,
}

interface VmRuntimeContext {
	constants: VmProgram['constants'],
	push: (value: Value) => void,
	pop: () => Value,
	popNum: () => number,
	popBool: () => boolean,
}

export {
	type CallFrame,
	type ClosureInstruction,
	type Instruction,
	type LocalCell,
	type Value,
	type VmClosure,
	type VmProgram,
	type VmRuntimeContext,
}
