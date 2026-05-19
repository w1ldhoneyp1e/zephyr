import {Opcode} from '../../../vm/types'
import {type BytecodeGenerator} from '../BytecodeGenerator'
import {type CompilerState} from '../CompilerState'
import {
	type ExpressionNode,
	type NoArgOpcode,
	type Value,
} from '../context'
import {emitCallableClosure} from './functionEmitter'

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
			const resolved = state.resolveExpressionBinding(binding)
			if (resolved.kind === 'local') {
				state.emitNumArg(Opcode.GetLocal, resolved.slot)
			}
			else if (resolved.kind === 'upvalue') {
				state.emitNumArg(Opcode.GetUpvalue, resolved.index)
			}
			else {
				const nameConstant = state.addConstant(resolved.name)
				state.emitNumArg(Opcode.GetGlobal, nameConstant)
			}
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
				throw new Error(`Неподдерживаемый унарный оператор: ${expression.operator}`)
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
				throw new Error(`Неподдерживаемый бинарный оператор: ${expression.operator}`)
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
			throw new Error(`Неподдерживаемое выражение: ${(expression as {type: string}).type}`)
	}
}

export {
	emitExpression,
}
