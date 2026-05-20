import {type SemanticBinding} from '../../semantics/context'
import {type BytecodeGenerator} from '../BytecodeGenerator'
import {type CompilerState} from '../CompilerState'
import {
	type FunctionDeclarationNode,
	type LambdaExpressionNode,
	type MethodDeclarationNode,
	type VmFunctionTemplate,
	Opcode,
} from '../context'
import {emitBlock} from './blockEmitter'
import {emitExpression} from './expressionEmitter'

function emitFunctionDeclaration(
	state: CompilerState,
	generator: BytecodeGenerator,
	node: FunctionDeclarationNode,
): void {
	const binding = state.getDeclarationBinding(node)
	const slot = state.declareBinding(binding)
	emitCallableClosure(state, generator, node)
	state.emitNumArg(Opcode.SetLocal, slot)
}

function emitMethodDeclaration(
	state: CompilerState,
	generator: BytecodeGenerator,
	node: MethodDeclarationNode,
): void {
	const receiverBinding = state.getMethodReceiverBinding(node)
	emitCallableClosure(state, generator, node, receiverBinding.declaration.name)
	emitBindingLoad(state, receiverBinding)
	const propertyNameIndex = state.addConstant(node.name)
	state.emitNumArg(Opcode.SetProp, propertyNameIndex)
}

function emitCallableClosure(
	state: CompilerState,
	generator: BytecodeGenerator,
	node: FunctionDeclarationNode | MethodDeclarationNode | LambdaExpressionNode,
	receiverTypeName?: string,
): void {
	const functionName = node.type === 'FunctionDeclaration'
		? node.name
		: node.type === 'MethodDeclaration'
			? `${receiverTypeName ?? 'Struct'}.${node.name}`
			: '<lambda>'
	const parameterBindings = state.getFunctionParameterBindings(node)
	const nested = generator.createFunctionCompiler(state, functionName, parameterBindings.length)
	nested.enterScope()
	for (const parameterBinding of parameterBindings) {
		nested.getState().declareBinding(parameterBinding)
	}
	if (node.type === 'LambdaExpression') {
		if (node.body.type === 'BlockStatement') {
			emitBlock(nested.getState(), generator, nested, node.body.statements)
			nested.emitNilReturn()
		}
		else {
			emitExpression(nested.getState(), generator, node.body)
			nested.getState().emitNoArg(Opcode.Return)
		}
	}
	else {
		emitBlock(nested.getState(), generator, nested, node.body.statements)
		nested.emitNilReturn()
	}
	nested.leaveScope()
	const prog = nested.buildVmProgram()
	generator.functionPrograms.push(prog)
	const programIndex = generator.functionPrograms.length
	const tmpl: VmFunctionTemplate = {
		kind: 'function',
		programIndex,
		arity: parameterBindings.length,
		upvalueCount: nested.getState().getUpvalues().length,
	}
	const constIdx = state.addConstant(tmpl)
	state.emitClosureInstr(constIdx, nested.getState().getUpvalues())
}

function emitBindingLoad(state: CompilerState, binding: SemanticBinding): void {
	const resolved = state.resolveExpressionBinding(binding)
	if (resolved.kind === 'local') {
		state.emitNumArg(Opcode.GetLocal, resolved.slot)
		return
	}
	if (resolved.kind === 'upvalue') {
		state.emitNumArg(Opcode.GetUpvalue, resolved.index)
		return
	}
	const nameConstant = state.addConstant(resolved.name)
	state.emitNumArg(Opcode.GetGlobal, nameConstant)
}

export {
	emitCallableClosure,
	emitBindingLoad,
	emitFunctionDeclaration,
	emitMethodDeclaration,
}
