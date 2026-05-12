import {type BytecodeGenerator} from '../BytecodeGenerator'
import {type CompilerState} from '../CompilerState'
import {
	type FunctionDeclarationNode,
	type VmFunctionTemplate,
	Opcode,
} from '../context'
import {emitBlock} from './blockEmitter'

function emitFunctionDeclaration(
	state: CompilerState,
	generator: BytecodeGenerator,
	node: FunctionDeclarationNode,
): void {
	const binding = state.getDeclarationBinding(node)
	const slot = state.declareBinding(binding)
	const nested = generator.createFunctionCompiler(state, node.name, node.params.length)
	nested.enterScope()
	for (const parameterBinding of state.getFunctionParameterBindings(node)) {
		nested.getState().declareBinding(parameterBinding)
	}
	emitBlock(nested.getState(), generator, nested, node.body.statements)
	nested.emitNilReturn()
	nested.leaveScope()
	const prog = nested.buildVmProgram()
	generator.functionPrograms.push(prog)
	const programIndex = generator.functionPrograms.length
	const tmpl: VmFunctionTemplate = {
		kind: 'function',
		programIndex,
		arity: node.params.length,
		upvalueCount: nested.getState().getUpvalues().length,
	}
	const constIdx = state.addConstant(tmpl)
	state.emitClosureInstr(constIdx, nested.getState().getUpvalues())
	state.emitNumArg(Opcode.SetLocal, slot)
}

export {
	emitFunctionDeclaration,
}
