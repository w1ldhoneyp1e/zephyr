import {type VmProgram, Opcode} from '../../vm/types'
import {type ProgramNode} from '../ast'
import {type SemanticModel} from '../semantics/context'
import {CompilerState} from './CompilerState'
import {compilerInvariant} from './errors'
import {FunctionCompiler} from './FunctionCompiler'

class BytecodeGenerator {
	functionPrograms: VmProgram[] = []
	private model: SemanticModel | null = null

	generate(program: ProgramNode, model: SemanticModel): VmProgram[] {
		this.functionPrograms = []
		this.model = model
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
		if (this.model === null) {
			compilerInvariant('BytecodeGenerator semantic model is not initialized')
		}

		return new FunctionCompiler(this, new CompilerState(parentState, fnName, arity, this.model))
	}
}

export {
	BytecodeGenerator,
}
