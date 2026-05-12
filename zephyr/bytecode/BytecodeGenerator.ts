import {type VmProgram, Opcode} from '../../vm/types'
import {type ProgramNode} from '../ast'
import {CompilerState} from './CompilerState'
import {FunctionCompiler} from './FunctionCompiler'

class BytecodeGenerator {
	functionPrograms: VmProgram[] = []

	generate(program: ProgramNode): VmProgram[] {
		this.functionPrograms = []
		const main = this.createFunctionCompiler(null, '__main__', 0)
		main.enterScope()
		for (const statement of program.body) {
			main.emitStatement(statement)
		}
		main.emitNilReturn()
		main.leaveScope()
		const mainVm = main.buildVmProgram()

		return [mainVm, ...this.functionPrograms]
	}

	createFunctionCompiler(parentState: CompilerState | null, fnName: string, arity: number): FunctionCompiler {
		return new FunctionCompiler(this, new CompilerState(parentState, fnName, arity))
	}
}

export {
	BytecodeGenerator,
}
