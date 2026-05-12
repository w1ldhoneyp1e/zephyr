import {type VmFunctionTemplate, Opcode} from '../../../vm/types'
import {type BytecodeGenerator} from '../BytecodeGenerator'
import {type CompilerState} from '../CompilerState'
import {
	type AssignmentStatementNode,
	type ForRangeStatementNode,
	type FunctionDeclarationNode,
	type StatementNode,
} from '../context'
import {type FunctionCompiler} from '../FunctionCompiler'
import {emitAssignment} from './assignmentEmitter'
import {emitBlock} from './blockEmitter'
import {emitExpression} from './expressionEmitter'
import {emitForRange} from './forRangeEmitter'
import {emitFunctionDeclaration} from './functionEmitter'

function emitStatement(
	state: CompilerState,
	generator: BytecodeGenerator,
	compiler: FunctionCompiler,
	statement: StatementNode,
): void {
	switch (statement.type) {
		case 'VariableDeclaration': {
			const slot = state.declareLocal(statement.name, statement.kind === 'const')
			if (statement.initializer !== null) {
				emitExpression(state, statement.initializer)
			}
			else {
				state.emitNoArg(Opcode.Nil)
			}
			state.emitNumArg(Opcode.SetLocal, slot)
			break
		}
		case 'AssignmentStatement':
			emitAssignment(state, statement)
			break
		case 'ExpressionStatement':
			emitExpression(state, statement.expression)
			state.emitNoArg(Opcode.Pop)
			break
		case 'IfStatement': {
			emitExpression(state, statement.condition)
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
			emitExpression(state, statement.condition)
			const endJump = state.emitJump(Opcode.JumpIfFalse)
			emitBlock(state, generator, compiler, statement.body.statements)
			state.emitNumArg(Opcode.Jump, loopStart)
			state.patchJump(endJump, state.getInstructions().length)
			break
		}
		case 'ForRangeStatement':
			emitForRange(state, generator, compiler, statement)
			break
		case 'ReturnStatement':
			if (statement.value !== null) {
				emitExpression(state, statement.value)
			}
			else {
				state.emitNoArg(Opcode.Nil)
			}
			state.emitNoArg(Opcode.Return)
			break
		case 'BlockStatement':
			emitBlock(state, generator, compiler, statement.statements)
			break
		case 'FunctionDeclaration':
			emitFunctionDeclaration(state, generator, statement)
			break
		default:
			throw new Error(`Неподдерживаемый statement: ${(statement as {type: string}).type}`)
	}
}

export {
	emitExpression,
	emitStatement,
}
