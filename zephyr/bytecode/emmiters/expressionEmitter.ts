import {Opcode} from '../../../vm/types'
import {type CompilerState} from '../CompilerState'
import {
	type ExpressionNode,
	type NoArgOpcode,
	type Value,
} from '../context'

function emitExpression(state: CompilerState, expression: ExpressionNode): void {
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
			const resolved = state.resolveExpressionBinding(expression.name)
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
			emitExpression(state, expression.argument)
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
			emitExpression(state, expression.left)
			emitExpression(state, expression.right)
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
				emitExpression(state, element)
			}
			state.emitNumArg(Opcode.CreateArr, expression.elements.length)
			break
		}
		case 'IndexExpression': {
			emitExpression(state, expression.object)
			emitExpression(state, expression.index)
			state.emitNoArg(Opcode.GetEl)
			break
		}
		case 'CallExpression': {
			const argc = expression.args.length
			for (const arg of expression.args) {
				emitExpression(state, arg)
			}
			emitExpression(state, expression.callee)
			state.emitNumArg(Opcode.Call, argc)
			break
		}
		default:
			throw new Error(`Неподдерживаемое выражение: ${(expression as {type: string}).type}`)
	}
}

export {
	emitExpression,
}
