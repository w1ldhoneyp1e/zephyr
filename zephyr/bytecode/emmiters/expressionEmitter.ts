import {Opcode} from '../../../vm/types'
import {match} from '../../utils'
import {type BytecodeGenerator} from '../BytecodeGenerator'
import {type CompilerState} from '../CompilerState'
import {
	type ExpressionNode,
	type NoArgOpcode,
	type Value,
} from '../context'
import {compilerInvariant} from '../errors'
import {emitBindingLoad, emitCallableClosure} from './functionEmitter'

function emitExpression(state: CompilerState, generator: BytecodeGenerator, expression: ExpressionNode): void {
	switch (expression.type) {
		case 'LiteralExpression': {
			if (expression.value === null) {
				state.emitNoArg(Opcode.Nil)
			}
			else if (expression.value === true) {
				state.emitNoArg(Opcode.True)
			}
			else if (expression.value === false) {
				state.emitNoArg(Opcode.False)
			}
			else {
				const idx = state.addConstant(expression.value as Value)
				state.emitNumArg(Opcode.Const, idx)
			}
			break
		}
		case 'IdentifierExpression': {
			const binding = state.getExpressionBinding(expression)
			if (binding.kind === 'super') {
				emitBindingLoad(state, binding.selfBinding)
				emitBindingLoad(state, binding.baseClassBinding)
				state.emitNoArg(Opcode.MakeSuper)
				break
			}
			const resolved = state.resolveExpressionBinding(binding)
			match(resolved, 'kind', {
				local: value => state.emitNumArg(Opcode.GetLocal, value.slot),
				upvalue: value => state.emitNumArg(Opcode.GetUpvalue, value.index),
				global: value => {
					const nameConstant = state.addConstant(value.name)
					state.emitNumArg(Opcode.GetGlobal, nameConstant)
				},
			})
			break
		}
		case 'UnaryExpression': {
			emitExpression(state, generator, expression.argument)
			if (expression.operator === '-') {
				state.emitNoArg(Opcode.Neg)
			}
			else if (expression.operator === '!') {
				state.emitNoArg(Opcode.Not)
			}
			else {
				compilerInvariant(`unsupported unary operator in bytecode emitter: ${expression.operator}`)
			}
			break
		}
		case 'BinaryExpression': {
			if (expression.operator === '??') {
				emitExpression(state, generator, expression.left)
				state.emitNoArg(Opcode.Dup)
				state.emitNoArg(Opcode.Nil)
				state.emitNoArg(Opcode.Eq)
				const rightJump = state.emitJump(Opcode.JumpIfFalse)
				state.emitNoArg(Opcode.Pop)
				emitExpression(state, generator, expression.right)
				state.patchJump(rightJump, state.getInstructions().length)
				break
			}
			emitExpression(state, generator, expression.left)
			emitExpression(state, generator, expression.right)
			const opMap: Record<string, NoArgOpcode> = {
				'+': Opcode.Add,
				'-': Opcode.Sub,
				'*': Opcode.Mul,
				'/': Opcode.Div,
				'%': Opcode.Mod,
				'==': Opcode.Eq,
				'!=': Opcode.Ne,
				'<': Opcode.Lt,
				'<=': Opcode.Lte,
				'>': Opcode.Gt,
				'>=': Opcode.Gte,
				'&&': Opcode.And,
				'||': Opcode.Or,
			}
			const opcode = opMap[expression.operator]
			if (opcode === undefined) {
				compilerInvariant(`unsupported binary operator in bytecode emitter: ${expression.operator}`)
			}
			state.emitNoArg(opcode)
			break
		}
		case 'ArrayExpression': {
			for (const element of expression.elements) {
				emitExpression(state, generator, element)
			}
			state.emitNumArg(Opcode.CreateArr, expression.elements.length)
			break
		}
		case 'ChooseExpression': {
			const endJumps: number[] = []
			for (const branch of expression.branches) {
				emitExpression(state, generator, branch.condition)
				const nextBranchJump = state.emitJump(Opcode.JumpIfFalse)
				emitExpression(state, generator, branch.value)
				endJumps.push(state.emitJump(Opcode.Jump))
				state.patchJump(nextBranchJump, state.getInstructions().length)
			}
			if (expression.defaultValue === null) {
				state.emitNoArg(Opcode.Nil)
			}
			else {
				emitExpression(state, generator, expression.defaultValue)
			}
			for (const endJump of endJumps) {
				state.patchJump(endJump, state.getInstructions().length)
			}
			break
		}
		case 'CollectExpression': {
			state.enterScope()
			const resultSlot = state.declareInternalLocal('collect_result')
			const countSlot = state.declareInternalLocal('collect_count')
			state.emitNumArg(Opcode.CreateArr, 0)
			state.emitNumArg(Opcode.SetLocal, resultSlot)
			const zeroIndex = state.addConstant(0)
			state.emitNumArg(Opcode.Const, zeroIndex)
			state.emitNumArg(Opcode.SetLocal, countSlot)
			for (const branch of expression.branches) {
				emitExpression(state, generator, branch.condition)
				const nextBranchJump = state.emitJump(Opcode.JumpIfFalse)
				emitExpression(state, generator, branch.value)
				state.emitNumArg(Opcode.GetLocal, resultSlot)
				state.emitNumArg(Opcode.GetLocal, countSlot)
				state.emitNoArg(Opcode.SetEl)
				state.emitNumArg(Opcode.IncLocal, countSlot)
				state.patchJump(nextBranchJump, state.getInstructions().length)
			}
			state.emitNumArg(Opcode.GetLocal, resultSlot)
			state.leaveScope()
			break
		}
		case 'MatchExpression': {
			state.enterScope()
			const subjectSlot = state.declareInternalLocal('match_subject')
			emitExpression(state, generator, expression.subject)
			state.emitNumArg(Opcode.SetLocal, subjectSlot)
			const endJumps: number[] = []
			for (const branch of expression.branches) {
				state.emitNumArg(Opcode.GetLocal, subjectSlot)
				emitExpression(state, generator, branch.pattern)
				state.emitNoArg(Opcode.Eq)
				const nextBranchJump = state.emitJump(Opcode.JumpIfFalse)
				emitExpression(state, generator, branch.value)
				endJumps.push(state.emitJump(Opcode.Jump))
				state.patchJump(nextBranchJump, state.getInstructions().length)
			}
			if (expression.defaultValue === null) {
				state.emitNoArg(Opcode.Nil)
			}
			else {
				emitExpression(state, generator, expression.defaultValue)
			}
			for (const endJump of endJumps) {
				state.patchJump(endJump, state.getInstructions().length)
			}
			state.leaveScope()
			break
		}
		case 'MatchByExpression': {
			state.enterScope()
			const subjectSlot = state.declareInternalLocal('match_by_subject')
			emitExpression(state, generator, expression.subject)
			state.emitNumArg(Opcode.SetLocal, subjectSlot)
			const discriminantNameIndex = state.addConstant(expression.discriminant)
			const endJumps: number[] = []
			for (const branch of expression.branches) {
				state.emitNumArg(Opcode.GetLocal, subjectSlot)
				state.emitNumArg(Opcode.GetProp, discriminantNameIndex)
				emitLiteralValue(state, branch.pattern.value)
				state.emitNoArg(Opcode.Eq)
				const nextBranchJump = state.emitJump(Opcode.JumpIfFalse)
				emitExpression(state, generator, branch.value)
				endJumps.push(state.emitJump(Opcode.Jump))
				state.patchJump(nextBranchJump, state.getInstructions().length)
			}
			if (expression.defaultValue === null) {
				state.emitNoArg(Opcode.Nil)
			}
			else {
				emitExpression(state, generator, expression.defaultValue)
			}
			for (const endJump of endJumps) {
				state.patchJump(endJump, state.getInstructions().length)
			}
			state.leaveScope()
			break
		}
		case 'IndexExpression': {
			emitExpression(state, generator, expression.object)
			emitExpression(state, generator, expression.index)
			state.emitNoArg(Opcode.GetEl)
			break
		}
		case 'OptionalIndexExpression': {
			emitExpression(state, generator, expression.object)
			state.emitNoArg(Opcode.Dup)
			state.emitNoArg(Opcode.Nil)
			state.emitNoArg(Opcode.Eq)
			const nonNullJump = state.emitJump(Opcode.JumpIfFalse)
			const endJump = state.emitJump(Opcode.Jump)
			state.patchJump(nonNullJump, state.getInstructions().length)
			emitExpression(state, generator, expression.index)
			state.emitNoArg(Opcode.GetEl)
			state.patchJump(endJump, state.getInstructions().length)
			break
		}
		case 'MemberExpression': {
			emitExpression(state, generator, expression.object)
			const propertyNameIndex = state.addConstant(expression.property)
			state.emitNumArg(Opcode.GetProp, propertyNameIndex)
			break
		}
		case 'OptionalMemberExpression': {
			emitExpression(state, generator, expression.object)
			state.emitNoArg(Opcode.Dup)
			state.emitNoArg(Opcode.Nil)
			state.emitNoArg(Opcode.Eq)
			const nonNullJump = state.emitJump(Opcode.JumpIfFalse)
			const endJump = state.emitJump(Opcode.Jump)
			state.patchJump(nonNullJump, state.getInstructions().length)
			const propertyNameIndex = state.addConstant(expression.property)
			state.emitNumArg(Opcode.GetProp, propertyNameIndex)
			state.patchJump(endJump, state.getInstructions().length)
			break
		}
		case 'CallExpression': {
			const argc = expression.args.length
			for (const arg of expression.args) {
				emitExpression(state, generator, arg)
			}
			emitExpression(state, generator, expression.callee)
			state.emitNumArg(Opcode.Call, argc)
			break
		}
		case 'LambdaExpression': {
			emitCallableClosure(state, generator, expression)
			break
		}
		default:
			compilerInvariant(`unsupported expression in bytecode emitter: ${(expression as {type: string}).type}`)
	}
}

function emitLiteralValue(state: CompilerState, value: Value): void {
	if (value === null) {
		state.emitNoArg(Opcode.Nil)
		return
	}
	if (value === true) {
		state.emitNoArg(Opcode.True)
		return
	}
	if (value === false) {
		state.emitNoArg(Opcode.False)
		return
	}
	const idx = state.addConstant(value)
	state.emitNumArg(Opcode.Const, idx)
}

export {
	emitExpression,
}
