import {type CallExpressionNode, type ExpressionNode} from '../ast'
import {type WasmInstruction} from './WasmIr'

interface WasmIntrinsicLoweringContext {
	lowerAddressExpression: (expression: ExpressionNode) => WasmInstruction[],
	lowerNumberExpression: (expression: ExpressionNode) => WasmInstruction[],
	markMemoryUsed: () => void,
}

function lowerIntrinsicNumberExpression(
	expression: CallExpressionNode,
	context: WasmIntrinsicLoweringContext,
): WasmInstruction[] | null {
	const name = getDirectCallName(expression)
	switch (name) {
		case 'loadF64':
			return lowerLoadF64(expression, context)
		case 'loadRecordF64':
			return lowerLoadRecordF64(expression, context)
		case 'loadRecordI32':
			return lowerLoadRecordI32(expression, context)
		case 'storeF64':
		case 'storeRecordF64':
			throw new Error(`Wasm lowering only supports ${name} as an expression statement`)
		default:
			return null
	}
}

function lowerIntrinsicExpressionStatement(
	expression: CallExpressionNode,
	context: WasmIntrinsicLoweringContext,
): WasmInstruction[] | null {
	const name = getDirectCallName(expression)
	switch (name) {
		case 'storeF64':
			return lowerStoreF64(expression, context)
		case 'storeRecordF64':
			return lowerStoreRecordF64(expression, context)
		default:
			return null
	}
}

function lowerLoadF64(expression: CallExpressionNode, context: WasmIntrinsicLoweringContext): WasmInstruction[] {
	assertArgumentCount(expression, 1, 'loadF64')
	context.markMemoryUsed()

	return [
		...context.lowerAddressExpression(expression.args[0]),
		{
			op: 'f64.load',
			align: 3,
			offset: 0,
		},
	]
}

function lowerStoreF64(expression: CallExpressionNode, context: WasmIntrinsicLoweringContext): WasmInstruction[] {
	assertArgumentCount(expression, 2, 'storeF64')
	context.markMemoryUsed()

	return [
		...context.lowerAddressExpression(expression.args[0]),
		...context.lowerNumberExpression(expression.args[1]),
		{
			op: 'f64.store',
			align: 3,
			offset: 0,
		},
	]
}

function lowerLoadRecordF64(expression: CallExpressionNode, context: WasmIntrinsicLoweringContext): WasmInstruction[] {
	assertArgumentCount(expression, 4, 'loadRecordF64')
	context.markMemoryUsed()

	return [
		...lowerRecordFieldAddressExpression(expression, context),
		{
			op: 'f64.load',
			align: 3,
			offset: 0,
		},
	]
}

function lowerLoadRecordI32(expression: CallExpressionNode, context: WasmIntrinsicLoweringContext): WasmInstruction[] {
	assertArgumentCount(expression, 4, 'loadRecordI32')
	context.markMemoryUsed()

	return [
		...lowerRecordFieldAddressExpression(expression, context),
		{
			op: 'i32.load',
			align: 2,
			offset: 0,
		},
		{
			op: 'f64.convert_i32_s',
		},
	]
}

function lowerStoreRecordF64(expression: CallExpressionNode, context: WasmIntrinsicLoweringContext): WasmInstruction[] {
	assertArgumentCount(expression, 5, 'storeRecordF64')
	context.markMemoryUsed()

	return [
		...lowerRecordFieldAddressExpression(expression, context),
		...context.lowerNumberExpression(expression.args[4]),
		{
			op: 'f64.store',
			align: 3,
			offset: 0,
		},
	]
}

function lowerRecordFieldAddressExpression(
	expression: CallExpressionNode,
	context: WasmIntrinsicLoweringContext,
): WasmInstruction[] {
	const [base, index, rowSize, fieldOffset] = expression.args

	return context.lowerAddressExpression({
		type: 'BinaryExpression',
		operator: '+',
		left: {
			type: 'BinaryExpression',
			operator: '+',
			left: base,
			right: {
				type: 'BinaryExpression',
				operator: '*',
				left: index,
				right: rowSize,
			},
		},
		right: fieldOffset,
	})
}

function getDirectCallName(expression: CallExpressionNode): string | null {
	return expression.callee.type === 'IdentifierExpression'
		? expression.callee.name
		: null
}

function assertArgumentCount(expression: CallExpressionNode, expected: number, name: string): void {
	if (expression.args.length !== expected) {
		throw new Error(`Wasm intrinsic ${name} expects ${expected} arguments, got ${expression.args.length}`)
	}
}

export {
	type WasmIntrinsicLoweringContext,
	lowerIntrinsicExpressionStatement,
	lowerIntrinsicNumberExpression,
}
