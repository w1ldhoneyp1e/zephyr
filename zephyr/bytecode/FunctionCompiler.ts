import {type StatementNode} from '../ast'
import {type BytecodeGenerator} from './BytecodeGenerator'
import {type CompilerState} from './CompilerState'
import {type VmProgram, Opcode} from './context'
import {emitStatement} from './emmiters/statementEmitter'

class FunctionCompiler {
	constructor(
		private readonly generator: BytecodeGenerator,
		private readonly state: CompilerState,
	) {
	}

	buildVmProgram(): VmProgram {
		return this.state.buildVmProgram()
	}

	emitNilReturn(): void {
		this.state.emitNoArg(Opcode.Nil)
		this.state.emitNoArg(Opcode.Return)
	}

	emitStatement(statement: StatementNode): void {
		emitStatement(this.state, this.generator, this, statement)
	}

	getState(): CompilerState {
		return this.state
	}

	enterScope(): void {
		this.state.enterScope()
	}

	leaveScope(): void {
		this.state.leaveScope()
	}
}

export {
	FunctionCompiler,
}
