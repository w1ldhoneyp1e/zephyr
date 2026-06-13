import {Opcode} from '../../../vm/types'
import {type BytecodeGenerator} from '../BytecodeGenerator'
import {type CompilerState} from '../CompilerState'
import {
	type AssignmentStatementNode,
	type ClassDeclarationNode,
	type ForStatementNode,
	type ForRangeStatementNode,
	type StatementNode,
	type VmStructTemplate,
} from '../context'
import {compilerInvariant} from '../errors'
import {type FunctionCompiler} from '../FunctionCompiler'
import {emitAssignment} from './assignmentEmitter'
import {emitBlock} from './blockEmitter'
import {emitExpression} from './expressionEmitter'
import {emitForRange} from './forRangeEmitter'
import {
	emitBindingLoad,
	emitConstructorDeclaration,
	emitFunctionDeclaration,
	emitMethodDeclaration,
} from './functionEmitter'

function emitStatement(
	state: CompilerState,
	generator: BytecodeGenerator,
	compiler: FunctionCompiler,
	statement: StatementNode,
): void {
	state.withNodeLocation(statement, () => emitStatementCore(state, generator, compiler, statement))
}

function emitStatementCore(
	state: CompilerState,
	generator: BytecodeGenerator,
	compiler: FunctionCompiler,
	statement: StatementNode,
): void {
	switch (statement.type) {
		case 'VariableDeclaration': {
			const binding = state.getDeclarationBinding(statement)
			const slot = state.declareBinding(binding)
			if (statement.initializer !== null) {
				emitExpression(state, generator, statement.initializer)
			}
			else {
				state.emitNoArg(Opcode.Nil)
			}
			state.emitNumArg(Opcode.SetLocal, slot)
			break
		}
		case 'TypeAliasDeclaration':
			break
		case 'AssignmentStatement':
			emitAssignment(state, generator, statement)
			break
		case 'ExpressionStatement':
			emitExpression(state, generator, statement.expression)
			state.emitNoArg(Opcode.Pop)
			break
		case 'IfStatement': {
			emitExpression(state, generator, statement.condition)
			const elseJump = state.emitJump(Opcode.JumpIfFalse)
			emitBlock(state, generator, compiler, statement.thenBranch.statements)
			if (statement.elseBranch !== null) {
				const endJump = state.emitJump(Opcode.Jump)
				state.patchJump(elseJump, state.getInstructions().length)
				emitBlock(state, generator, compiler, statement.elseBranch.statements)
				state.patchJump(endJump, state.getInstructions().length)
			}
			else {
				state.patchJump(elseJump, state.getInstructions().length)
			}
			break
		}
		case 'WhileStatement': {
			const loopStart = state.getInstructions().length
			compiler.beginLoop()
			compiler.setContinueTarget(loopStart)
			emitExpression(state, generator, statement.condition)
			const endJump = state.emitJump(Opcode.JumpIfFalse)
			emitBlock(state, generator, compiler, statement.body.statements)
			state.emitNumArg(Opcode.Jump, loopStart)
			const loopEnd = state.getInstructions().length
			state.patchJump(endJump, loopEnd)
			compiler.endLoop(loopEnd)
			break
		}
		case 'ForRangeStatement':
			emitForRange(state, generator, compiler, statement)
			break
		case 'ForStatement':
			emitForStatement(state, generator, compiler, statement)
			break
		case 'ReturnStatement':
			if (statement.value !== null) {
				emitExpression(state, generator, statement.value)
			}
			else {
				state.emitNoArg(Opcode.Nil)
			}
			state.emitNoArg(Opcode.Return)
			break
		case 'BreakStatement':
			compiler.emitBreak()
			break
		case 'ContinueStatement':
			compiler.emitContinue()
			break
		case 'BlockStatement':
			emitBlock(state, generator, compiler, statement.statements)
			break
		case 'FunctionDeclaration':
			emitFunctionDeclaration(state, generator, statement)
			break
		case 'ClassDeclaration':
			emitClassDeclaration(state, generator, statement)
			break
		default:
			compilerInvariant(`unsupported statement in bytecode emitter: ${(statement as {type: string}).type}`)
	}
}

function emitForStatement(
	state: CompilerState,
	generator: BytecodeGenerator,
	compiler: FunctionCompiler,
	statement: ForStatementNode,
): void {
	state.enterScope()
	compiler.beginLoop()
	const iteratorBinding = state.getForRangeBinding(statement)
	const iteratorSlot = state.declareBinding(iteratorBinding)
	emitExpression(state, generator, statement.start)
	state.emitNumArg(Opcode.SetLocal, iteratorSlot)
	const loopStart = state.getInstructions().length
	emitExpression(state, generator, statement.condition)
	const endJump = state.emitJump(Opcode.JumpIfFalse)
	emitBlock(state, generator, compiler, statement.body.statements)
	compiler.setContinueTarget(state.getInstructions().length)
	emitExpression(state, generator, statement.increment)
	state.emitNumArg(Opcode.SetLocal, iteratorSlot)
	state.emitNumArg(Opcode.Jump, loopStart)
	const loopEnd = state.getInstructions().length
	state.patchJump(endJump, loopEnd)
	compiler.endLoop(loopEnd)
	state.leaveScope()
}

function emitClassDeclaration(
	state: CompilerState,
	generator: BytecodeGenerator,
	statement: ClassDeclarationNode,
): void {
	const binding = state.getDeclarationBinding(statement)
	const slot = state.declareBinding(binding)
	const template: VmStructTemplate = {
		kind: 'struct',
		name: statement.name,
		baseClass: null,
		fields: statement.fields.map(field => field.name),
		constructorMethod: null,
		methods: {},
	}
	const constIdx = state.addConstant(template)
	state.emitNumArg(Opcode.Const, constIdx)
	state.emitNumArg(Opcode.SetLocal, slot)
	const baseBinding = state.getClassBaseBinding(statement)
	if (baseBinding !== null) {
		emitBindingLoad(state, baseBinding)
		state.emitNumArg(Opcode.GetLocal, slot)
		const propertyNameIndex = state.addConstant('__baseClass__')
		state.emitNumArg(Opcode.SetProp, propertyNameIndex)
	}
	for (const method of statement.methods) {
		emitMethodDeclaration(state, generator, method)
	}
	if (statement.constructorDeclaration !== null) {
		emitConstructorDeclaration(state, generator, statement.constructorDeclaration)
	}
}

export {
	emitExpression,
	emitStatement,
}
