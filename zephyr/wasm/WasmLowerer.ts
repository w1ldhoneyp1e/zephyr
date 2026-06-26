/* eslint-disable @stylistic/max-len */
import {
	type AssignmentStatementNode,
	type BinaryExpressionNode,
	type BlockStatementNode,
	type CallExpressionNode,
	type ExpressionNode,
	type ForRangeStatementNode,
	type ForStatementNode,
	type FunctionDeclarationNode,
	type IdentifierExpressionNode,
	type IfStatementNode,
	type IndexExpressionNode,
	type LiteralExpressionNode,
	type MemberExpressionNode,
	type ObjectTypeMemberNode,
	type ProgramNode,
	type ReturnStatementNode,
	type StatementNode,
	type TypeAliasDeclarationNode,
	type TypeName,
	type UnaryExpressionNode,
	type VariableDeclarationNode,
	type WhileStatementNode,
	typeNameToString,
} from '../ast'
import {
	type WasmRecordFieldLayout,
	type WasmRecordLayout,
	createRecordLayout,
	getRecordField,
} from './RecordLayout'
import {
	type WasmIntrinsicLoweringContext,
	lowerIntrinsicExpressionStatement,
	lowerIntrinsicNumberExpression,
} from './WasmIntrinsics'
import {
	type WasmFunctionIr,
	type WasmInstruction,
	type WasmModuleIr,
	type WasmValueType,
} from './WasmIr'

type NumericBinaryOpcode = 'f64.add' | 'f64.sub' | 'f64.mul' | 'f64.div'
type NumericComparisonOpcode = 'f64.eq' | 'f64.ne' | 'f64.lt' | 'f64.le' | 'f64.gt' | 'f64.ge'

interface WasmLocalBinding {
	index: number,
	valueType: WasmValueType,
	numberArray?: boolean,
	recordArrayLayout?: WasmRecordLayout,
}

interface ModuleLoweringContext {
	functionIndices: Map<string, number>,
	functionParamTypes: Map<string, WasmValueType[]>,
	functionResultTypes: Map<string, WasmValueType>,
	recordLayouts: Map<string, WasmRecordLayout>,
	usesMemory: boolean,
}

type WasmLoweringOptions = Record<string, never>

interface FunctionLoweringContext {
	module: ModuleLoweringContext,
	locals: Map<string, WasmLocalBinding>,
	localTypes: WasmFunctionIr['locals'],
	currentResultType: WasmValueType,
	nextLocalIndex: number,
	nextInternalLocalId: number,
}

function lowerProgramToWasmIr(program: ProgramNode): WasmModuleIr {
	const functions = program.body
		.filter((statement): statement is FunctionDeclarationNode => statement.type === 'FunctionDeclaration')
	const recordLayouts = collectRecordLayouts(program)
	const context: ModuleLoweringContext = {
		functionIndices: new Map(functions.map((fn, index) => [fn.name, index])),
		functionParamTypes: new Map(functions.map(fn => [
			fn.name,
			fn.params.map(param => getWasmParameterType(param.typeName, recordLayouts)),
		])),
		functionResultTypes: new Map(functions.map(fn => [fn.name, getWasmResultType(fn.returnTypeName)])),
		recordLayouts,
		usesMemory: false,
	}
	const loweredFunctions = functions.map(fn => lowerFunctionDeclaration(fn, context))

	return {
		memory: context.usesMemory
			? {
				minPages: 1,
				exportName: 'memory',
			}
			: undefined,
		functions: loweredFunctions,
	}
}

function lowerFunctionDeclaration(fn: FunctionDeclarationNode, moduleContext: ModuleLoweringContext): WasmFunctionIr {
	const result = getWasmResultType(fn.returnTypeName)
	const params = fn.params.map(param => {
		assertSupportedParameterType(param.typeName, `parameter ${param.name}`, moduleContext)
		return getWasmParameterType(param.typeName, moduleContext.recordLayouts)
	})
	const context: FunctionLoweringContext = {
		module: moduleContext,
		locals: new Map(fn.params.map((param, index) => [
			param.name,
			{
				index,
				valueType: params[index],
				numberArray: isNumberArrayType(param.typeName),
				recordArrayLayout: getRecordArrayLayout(param.typeName, moduleContext) ?? undefined,
			},
		])),
		localTypes: [],
		currentResultType: result,
		nextLocalIndex: fn.params.length,
		nextInternalLocalId: 0,
	}
	const body: WasmInstruction[] = []
	body.push(...lowerBlockStatement(fn.body, context))

	return {
		name: fn.name,
		params,
		result,
		locals: context.localTypes,
		body,
		exported: true,
	}
}

function lowerStatement(statement: StatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	switch (statement.type) {
		case 'VariableDeclaration':
			return lowerVariableDeclaration(statement, context)
		case 'AssignmentStatement':
			return lowerAssignmentStatement(statement, context)
		case 'IfStatement':
			return lowerIfStatement(statement, context)
		case 'WhileStatement':
			return lowerWhileStatement(statement, context)
		case 'ForRangeStatement':
			return lowerForRangeStatement(statement, context)
		case 'ForStatement':
			return lowerForStatement(statement, context)
		case 'ReturnStatement':
			return lowerReturnStatement(statement, context)
		case 'ExpressionStatement':
			return lowerExpressionStatement(statement.expression, context)
		default:
			throw new Error(`Wasm lowering does not support statement ${statement.type}`)
	}
}

function lowerBlockStatement(block: BlockStatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	return block.statements.flatMap(statement => lowerStatement(statement, context))
}

function lowerVariableDeclaration(statement: VariableDeclarationNode, context: FunctionLoweringContext): WasmInstruction[] {
	const localType = getWasmLocalType(statement.typeName, `variable ${statement.name}`)
	const binding = declareLocal(context, statement.name, localType)
	if (statement.initializer === null) {
		return [
			{
				op: localType === 'f64'
					? 'f64.const'
					: 'i32.const',
				value: 0,
			},
			{
				op: 'local.set',
				index: binding.index,
			},
		]
	}

	return [
		...lowerExpressionAsWasmType(statement.initializer, binding.valueType, context),
		{
			op: 'local.set',
			index: binding.index,
		},
	]
}

function lowerAssignmentStatement(statement: AssignmentStatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	if (statement.target.type === 'MemberTarget') {
		return lowerMemberAssignmentStatement(statement, context)
	}
	if (statement.target.type === 'IndexTarget') {
		return lowerIndexAssignmentStatement(statement, context)
	}
	if (statement.target.type !== 'IdentifierTarget') {
		throw new Error('Wasm lowering only supports identifier and packed array assignment targets')
	}
	const binding = getLocal(context, statement.target.name)

	return [
		...lowerExpressionAsWasmType(statement.value, binding.valueType, context),
		{
			op: 'local.set',
			index: binding.index,
		},
	]
}

function lowerMemberAssignmentStatement(statement: AssignmentStatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	if (statement.target.type !== 'MemberTarget') {
		throw new Error('Expected member assignment target')
	}
	const access = resolveRecordArrayFieldAccess(statement.target.object, statement.target.property, context)
	if (access === null) {
		throw new Error(`Wasm lowering does not support member assignment .${statement.target.property}`)
	}

	return lowerRecordArrayFieldStore(access, statement.value, context)
}

function lowerIndexAssignmentStatement(statement: AssignmentStatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	if (statement.target.type !== 'IndexTarget') {
		throw new Error('Expected index assignment target')
	}
	const access = resolveNumberArrayAccess(statement.target.object, statement.target.index, context)
	if (access === null) {
		throw new Error('Wasm lowering does not support index assignment target')
	}

	return lowerNumberArrayElementStore(access, statement.value, context)
}

function lowerIfStatement(statement: IfStatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	return [
		...lowerBooleanExpression(statement.condition, context),
		{
			op: 'if',
			thenBody: lowerBlockStatement(statement.thenBranch, context),
			elseBody: statement.elseBranch === null
				? undefined
				: lowerBlockStatement(statement.elseBranch, context),
		},
	]
}

function lowerWhileStatement(statement: WhileStatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	return [
		{
			op: 'block',
			body: [
				{
					op: 'loop',
					body: [
						...lowerBooleanExpression(statement.condition, context),
						{
							op: 'i32.const',
							value: 0,
						},
						{
							op: 'i32.eq',
						},
						{
							op: 'br_if',
							labelIndex: 1,
						},
						...lowerBlockStatement(statement.body, context),
						{
							op: 'br',
							labelIndex: 0,
						},
					],
				},
			],
		},
	]
}

function lowerForRangeStatement(statement: ForRangeStatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	const previousIteratorBinding = context.locals.get(statement.iterator) ?? null
	const iteratorBinding = declareLocal(context, statement.iterator, 'i32')
	const endBinding = declareLocal(context, createInternalLocalName(context, 'forEnd'), 'i32')
	const body = lowerBlockStatement(statement.body, context)
	restoreLocalBinding(context, statement.iterator, previousIteratorBinding)

	return [
		...lowerAddressExpression(statement.start, context),
		{
			op: 'local.set',
			index: iteratorBinding.index,
		},
		...lowerAddressExpression(statement.end, context),
		{
			op: 'local.set',
			index: endBinding.index,
		},
		{
			op: 'block',
			body: [
				{
					op: 'loop',
					body: [
						{
							op: 'local.get',
							index: iteratorBinding.index,
						},
						{
							op: 'local.get',
							index: endBinding.index,
						},
						{
							op: 'i32.lt_s',
						},
						{
							op: 'i32.const',
							value: 0,
						},
						{
							op: 'i32.eq',
						},
						{
							op: 'br_if',
							labelIndex: 1,
						},
						...body,
						{
							op: 'local.get',
							index: iteratorBinding.index,
						},
						{
							op: 'i32.const',
							value: 1,
						},
						{
							op: 'i32.add',
						},
						{
							op: 'local.set',
							index: iteratorBinding.index,
						},
						{
							op: 'br',
							labelIndex: 0,
						},
					],
				},
			],
		},
	]
}

function lowerForStatement(statement: ForStatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	const previousIteratorBinding = context.locals.get(statement.iterator) ?? null
	const iteratorBinding = declareNumberLocal(context, statement.iterator)
	const start = lowerNumberExpression(statement.start, context)
	const condition = lowerBooleanExpression(statement.condition, context)
	const body = lowerBlockStatement(statement.body, context)
	if (statement.incrementTarget !== statement.iterator) {
		throw new Error(`Wasm lowering requires for increment to update ${statement.iterator}`)
	}
	const increment = lowerNumberExpression(statement.increment, context)
	restoreLocalBinding(context, statement.iterator, previousIteratorBinding)

	return [
		...start,
		{
			op: 'local.set',
			index: iteratorBinding.index,
		},
		{
			op: 'block',
			body: [
				{
					op: 'loop',
					body: [
						...condition,
						{
							op: 'i32.const',
							value: 0,
						},
						{
							op: 'i32.eq',
						},
						{
							op: 'br_if',
							labelIndex: 1,
						},
						...body,
						...increment,
						{
							op: 'local.set',
							index: iteratorBinding.index,
						},
						{
							op: 'br',
							labelIndex: 0,
						},
					],
				},
			],
		},
	]
}

function lowerReturnStatement(statement: ReturnStatementNode, context: FunctionLoweringContext): WasmInstruction[] {
	if (statement.value === null) {
		throw new Error('Wasm lowering requires return value')
	}

	return [
		...lowerExpressionAsWasmType(statement.value, context.currentResultType, context),
		{
			op: 'return',
		},
	]
}

function lowerExpressionStatement(expression: ExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	if (expression.type === 'CallExpression') {
		const intrinsicInstructions = lowerIntrinsicExpressionStatement(expression, createIntrinsicContext(context))
		if (intrinsicInstructions !== null) {
			return intrinsicInstructions
		}
	}

	return [
		...lowerNumberExpression(expression, context),
		{
			op: 'drop',
		},
	]
}

function lowerNumberExpression(expression: ExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	switch (expression.type) {
		case 'LiteralExpression':
			return lowerNumericLiteralExpression(expression)
		case 'IdentifierExpression':
			return lowerIdentifierExpression(expression, context)
		case 'IndexExpression':
			return lowerNumberArrayElementExpression(expression, context)
		case 'MemberExpression':
			return lowerRecordFieldNumberExpression(expression, context)
		case 'UnaryExpression':
			return lowerNumericUnaryExpression(expression, context)
		case 'BinaryExpression':
			return lowerNumericBinaryExpression(expression, context)
		case 'CallExpression':
			return lowerCallExpression(expression, context)
		default:
			throw new Error(`Wasm lowering does not support numeric expression ${expression.type}`)
	}
}

function lowerBooleanExpression(expression: ExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	switch (expression.type) {
		case 'LiteralExpression':
			return lowerBooleanLiteralExpression(expression)
		case 'IdentifierExpression':
			return lowerBooleanIdentifierExpression(expression, context)
		case 'MemberExpression':
			return lowerRecordFieldBooleanExpression(expression, context)
		case 'UnaryExpression':
			return lowerBooleanUnaryExpression(expression, context)
		case 'BinaryExpression':
			return lowerBooleanBinaryExpression(expression, context)
		case 'CallExpression':
			return lowerBooleanCallExpression(expression, context)
		default:
			throw new Error(`Wasm lowering does not support boolean expression ${expression.type}`)
	}
}

function lowerBooleanIdentifierExpression(
	expression: IdentifierExpressionNode,
	context: FunctionLoweringContext,
): WasmInstruction[] {
	const binding = getLocal(context, expression.name)
	if (binding.valueType !== 'i32') {
		throw new Error(`Wasm lowering does not support number local ${expression.name} as boolean`)
	}

	return [
		{
			op: 'local.get',
			index: binding.index,
		},
	]
}

function lowerNumericLiteralExpression(expression: LiteralExpressionNode): WasmInstruction[] {
	if (typeof expression.value !== 'number') {
		throw new Error('Wasm lowering only supports numeric literals')
	}

	return [
		{
			op: 'f64.const',
			value: expression.value,
		},
	]
}

function lowerBooleanLiteralExpression(expression: LiteralExpressionNode): WasmInstruction[] {
	if (typeof expression.value !== 'boolean') {
		throw new Error('Wasm lowering only supports boolean literals in conditions')
	}

	return [
		{
			op: 'i32.const',
			value: expression.value
				? 1
				: 0,
		},
	]
}

function lowerIdentifierExpression(expression: IdentifierExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	const binding = getLocal(context, expression.name)
	if (binding.valueType === 'i32') {
		return [
			{
				op: 'local.get',
				index: binding.index,
			},
			{
				op: 'f64.convert_i32_s',
			},
		]
	}

	return [
		{
			op: 'local.get',
			index: binding.index,
		},
	]
}

function lowerNumericUnaryExpression(expression: UnaryExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	if (expression.operator !== '-') {
		throw new Error(`Wasm lowering does not support unary operator ${expression.operator}`)
	}

	return [
		...lowerNumberExpression(expression.argument, context),
		{
			op: 'f64.neg',
		},
	]
}

function lowerBooleanUnaryExpression(expression: UnaryExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	if (expression.operator !== '!') {
		throw new Error(`Wasm lowering does not support boolean unary operator ${expression.operator}`)
	}

	return [
		...lowerBooleanExpression(expression.argument, context),
		{
			op: 'i32.const',
			value: 0,
		},
		{
			op: 'i32.eq',
		},
	]
}

function lowerNumericBinaryExpression(expression: BinaryExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	const op = getBinaryNumericOpcode(expression.operator)

	return [
		...lowerNumberExpression(expression.left, context),
		...lowerNumberExpression(expression.right, context),
		{
			op,
		},
	]
}

function lowerBooleanBinaryExpression(expression: BinaryExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	const op = getNumericComparisonOpcode(expression.operator)

	return [
		...lowerNumberExpression(expression.left, context),
		...lowerNumberExpression(expression.right, context),
		{
			op,
		},
	]
}

function lowerCallExpression(expression: CallExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	const intrinsicInstructions = lowerIntrinsicNumberExpression(expression, createIntrinsicContext(context))
	if (intrinsicInstructions !== null) {
		return intrinsicInstructions
	}
	if (expression.callee.type !== 'IdentifierExpression') {
		throw new Error('Wasm lowering only supports direct function calls')
	}
	const functionIndex = context.module.functionIndices.get(expression.callee.name)
	if (functionIndex === undefined) {
		throw new Error(`Unknown function ${expression.callee.name}`)
	}
	const paramTypes = context.module.functionParamTypes.get(expression.callee.name) ?? []

	return [
		...expression.args.flatMap((arg, index) => lowerExpressionAsWasmType(arg, paramTypes[index] ?? 'f64', context)),
		{
			op: 'call',
			functionIndex,
		},
	]
}

function lowerBooleanCallExpression(expression: CallExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	if (expression.callee.type !== 'IdentifierExpression') {
		throw new Error('Wasm lowering only supports direct boolean function calls')
	}
	const functionIndex = context.module.functionIndices.get(expression.callee.name)
	if (functionIndex === undefined) {
		throw new Error(`Unknown function ${expression.callee.name}`)
	}
	const resultType = context.module.functionResultTypes.get(expression.callee.name)
	if (resultType !== 'i32') {
		throw new Error(`Wasm lowering expected boolean function ${expression.callee.name}`)
	}
	const paramTypes = context.module.functionParamTypes.get(expression.callee.name) ?? []

	return [
		...expression.args.flatMap((arg, index) => lowerExpressionAsWasmType(arg, paramTypes[index] ?? 'f64', context)),
		{
			op: 'call',
			functionIndex,
		},
	]
}

function lowerExpressionAsWasmType(
	expression: ExpressionNode,
	type: WasmValueType,
	context: FunctionLoweringContext,
): WasmInstruction[] {
	return type === 'i32'
		? lowerI32Expression(expression, context)
		: lowerNumberExpression(expression, context)
}

function lowerI32Expression(expression: ExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	if (isBooleanExpressionShape(expression)) {
		return lowerBooleanExpression(expression, context)
	}

	return lowerAddressExpression(expression, context)
}

function isBooleanExpressionShape(expression: ExpressionNode): boolean {
	if (expression.type === 'LiteralExpression') {
		return typeof expression.value === 'boolean'
	}
	if (expression.type === 'UnaryExpression') {
		return expression.operator === '!'
	}
	if (expression.type === 'BinaryExpression') {
		return ['==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(expression.operator)
	}
	if (expression.type === 'MemberExpression') {
		return true
	}
	if (expression.type === 'CallExpression') {
		return true
	}

	return false
}

function lowerAddressExpression(expression: ExpressionNode, context: FunctionLoweringContext): WasmInstruction[] {
	if (expression.type === 'IdentifierExpression') {
		const binding = getLocal(context, expression.name)
		if (binding.valueType === 'i32') {
			return [
				{
					op: 'local.get',
					index: binding.index,
				},
			]
		}
	}

	return [
		...lowerNumberExpression(expression, context),
		{
			op: 'i32.trunc_f64_s',
		},
	]
}

interface NumberArrayAccess {
	base: IdentifierExpressionNode,
	index: ExpressionNode,
}

function lowerNumberArrayElementExpression(
	expression: IndexExpressionNode,
	context: FunctionLoweringContext,
): WasmInstruction[] {
	const access = resolveNumberArrayAccess(expression.object, expression.index, context)
	if (access === null) {
		throw new Error('Wasm lowering does not support numeric index expression')
	}

	return lowerNumberArrayElementLoad(access, context)
}

function resolveNumberArrayAccess(
	object: ExpressionNode,
	index: ExpressionNode,
	context: FunctionLoweringContext,
): NumberArrayAccess | null {
	if (object.type !== 'IdentifierExpression') {
		return null
	}
	const binding = getLocal(context, object.name)
	if (binding.numberArray !== true) {
		return null
	}

	return {
		base: object,
		index,
	}
}

function lowerNumberArrayElementLoad(access: NumberArrayAccess, context: FunctionLoweringContext): WasmInstruction[] {
	context.module.usesMemory = true
	return [
		...lowerNumberArrayElementAddress(access, context),
		{
			op: 'f64.load',
			align: 3,
			offset: 0,
		},
	]
}

function lowerNumberArrayElementStore(
	access: NumberArrayAccess,
	value: ExpressionNode,
	context: FunctionLoweringContext,
): WasmInstruction[] {
	context.module.usesMemory = true
	return [
		...lowerNumberArrayElementAddress(access, context),
		...lowerNumberExpression(value, context),
		{
			op: 'f64.store',
			align: 3,
			offset: 0,
		},
	]
}

function lowerNumberArrayElementAddress(access: NumberArrayAccess, context: FunctionLoweringContext): WasmInstruction[] {
	return [
		...lowerAddressExpression(access.base, context),
		...lowerAddressExpression(access.index, context),
		{
			op: 'i32.const',
			value: 8,
		},
		{
			op: 'i32.mul',
		},
		{
			op: 'i32.add',
		},
	]
}

function createIntrinsicContext(context: FunctionLoweringContext): WasmIntrinsicLoweringContext {
	return {
		lowerAddressExpression: expression => lowerAddressExpression(expression, context),
		lowerNumberExpression: expression => lowerNumberExpression(expression, context),
		markMemoryUsed: () => {
			context.module.usesMemory = true
		},
	}
}

function lowerRecordFieldNumberExpression(
	expression: MemberExpressionNode,
	context: FunctionLoweringContext,
): WasmInstruction[] {
	const access = resolveRecordArrayFieldAccess(expression.object, expression.property, context)
	if (access === null) {
		throw new Error(`Wasm lowering does not support numeric member expression .${expression.property}`)
	}
	const instructions = lowerRecordArrayFieldLoad(access, context)
	if (access.field.type === 'i32') {
		return [
			...instructions,
			{
				op: 'f64.convert_i32_s',
			},
		]
	}

	return instructions
}

function lowerRecordFieldBooleanExpression(
	expression: MemberExpressionNode,
	context: FunctionLoweringContext,
): WasmInstruction[] {
	const access = resolveRecordArrayFieldAccess(expression.object, expression.property, context)
	if (access === null) {
		throw new Error(`Wasm lowering does not support boolean member expression .${expression.property}`)
	}
	if (access.field.type !== 'i32') {
		return [
			...lowerRecordArrayFieldLoad(access, context),
			{
				op: 'f64.const',
				value: 0,
			},
			{
				op: 'f64.ne',
			},
		]
	}

	return lowerRecordArrayFieldLoad(access, context)
}

interface RecordArrayFieldAccess {
	base: IdentifierExpressionNode,
	index: ExpressionNode,
	layout: WasmRecordLayout,
	field: WasmRecordFieldLayout,
}

function resolveRecordArrayFieldAccess(
	object: ExpressionNode,
	property: string,
	context: FunctionLoweringContext,
): RecordArrayFieldAccess | null {
	if (object.type !== 'IndexExpression') {
		return null
	}
	const indexExpression = object as IndexExpressionNode
	if (indexExpression.object.type !== 'IdentifierExpression') {
		return null
	}
	const base = indexExpression.object
	const binding = getLocal(context, base.name)
	if (binding.recordArrayLayout === undefined) {
		return null
	}

	return {
		base,
		index: indexExpression.index,
		layout: binding.recordArrayLayout,
		field: getRecordField(binding.recordArrayLayout, property),
	}
}

function lowerRecordArrayFieldLoad(
	access: RecordArrayFieldAccess,
	context: FunctionLoweringContext,
): WasmInstruction[] {
	context.module.usesMemory = true
	return [
		...lowerRecordArrayFieldAddress(access, context),
		{
			op: access.field.type === 'f64'
				? 'f64.load'
				: 'i32.load',
			align: access.field.align === 8
				? 3
				: 2,
			offset: 0,
		},
	]
}

function lowerRecordArrayFieldStore(
	access: RecordArrayFieldAccess,
	value: ExpressionNode,
	context: FunctionLoweringContext,
): WasmInstruction[] {
	context.module.usesMemory = true
	return [
		...lowerRecordArrayFieldAddress(access, context),
		...(access.field.type === 'f64'
			? lowerNumberExpression(value, context)
			: lowerBooleanExpression(value, context)),
		{
			op: access.field.type === 'f64'
				? 'f64.store'
				: 'i32.store',
			align: access.field.align === 8
				? 3
				: 2,
			offset: 0,
		},
	]
}

function lowerRecordArrayFieldAddress(
	access: RecordArrayFieldAccess,
	context: FunctionLoweringContext,
): WasmInstruction[] {
	return [
		...lowerAddressExpression(access.base, context),
		...lowerAddressExpression(access.index, context),
		{
			op: 'i32.const',
			value: access.layout.size,
		},
		{
			op: 'i32.mul',
		},
		{
			op: 'i32.add',
		},
		{
			op: 'i32.const',
			value: access.field.offset,
		},
		{
			op: 'i32.add',
		},
	]
}

function getBinaryNumericOpcode(operator: BinaryExpressionNode['operator']): NumericBinaryOpcode {
	switch (operator) {
		case '+':
			return 'f64.add'
		case '-':
			return 'f64.sub'
		case '*':
			return 'f64.mul'
		case '/':
			return 'f64.div'
		default:
			throw new Error(`Wasm lowering does not support binary operator ${operator}`)
	}
}

function getNumericComparisonOpcode(operator: BinaryExpressionNode['operator']): NumericComparisonOpcode {
	switch (operator) {
		case '==':
			return 'f64.eq'
		case '!=':
			return 'f64.ne'
		case '<':
			return 'f64.lt'
		case '<=':
			return 'f64.le'
		case '>':
			return 'f64.gt'
		case '>=':
			return 'f64.ge'
		default:
			throw new Error(`Wasm lowering does not support boolean operator ${operator}`)
	}
}

function getLocal(context: FunctionLoweringContext, name: string): WasmLocalBinding {
	const binding = context.locals.get(name)
	if (binding === undefined) {
		throw new Error(`Unknown local ${name}`)
	}

	return binding
}

function declareNumberLocal(context: FunctionLoweringContext, name: string): WasmLocalBinding {
	return declareLocal(context, name, 'f64')
}

function declareLocal(context: FunctionLoweringContext, name: string, valueType: WasmValueType): WasmLocalBinding {
	const binding = {
		index: context.nextLocalIndex,
		valueType,
	}
	context.nextLocalIndex++
	context.locals.set(name, binding)
	context.localTypes.push(valueType)

	return binding
}

function createInternalLocalName(context: FunctionLoweringContext, prefix: string): string {
	const id = context.nextInternalLocalId
	context.nextInternalLocalId++

	return `__wasm_${prefix}_${id}`
}

function restoreLocalBinding(context: FunctionLoweringContext, name: string, binding: WasmLocalBinding | null): void {
	if (binding === null) {
		context.locals.delete(name)
		return
	}
	context.locals.set(name, binding)
}

function collectRecordLayouts(program: ProgramNode): Map<string, WasmRecordLayout> {
	const layouts = new Map<string, WasmRecordLayout>()
	for (const statement of program.body) {
		if (statement.type !== 'TypeAliasDeclaration') {
			continue
		}
		const layout = createRecordLayoutFromTypeAlias(statement)
		if (layout !== null) {
			layouts.set(statement.name, layout)
		}
	}

	return layouts
}

function createRecordLayoutFromTypeAlias(statement: TypeAliasDeclarationNode): WasmRecordLayout | null {
	if (typeof statement.typeName === 'string' || statement.typeName.objectMembers === undefined) {
		return null
	}

	return createRecordLayout(statement.typeName.objectMembers.map(member => ({
		name: member.name,
		type: getWasmFieldType(member),
	})))
}

function getWasmFieldType(member: ObjectTypeMemberNode): WasmValueType {
	const source = typeNameToString(member.typeName)
	switch (source) {
		case 'number':
			return 'f64'
		case 'boolean':
			return 'i32'
		default:
			throw new Error(`Wasm lowering only supports number/boolean record fields, got ${source} for ${member.name}`)
	}
}

function assertSupportedParameterType(typeName: TypeName, context: string, moduleContext: ModuleLoweringContext): void {
	if (typeNameToString(typeName) === 'number') {
		return
	}
	if (typeNameToString(typeName) === 'boolean') {
		return
	}
	if (isNumberArrayType(typeName)) {
		return
	}
	if (getRecordArrayLayout(typeName, moduleContext) !== null) {
		return
	}
	throw new Error(`Wasm lowering only supports number or typed record array for ${context}`)
}

function getWasmParameterType(typeName: TypeName, recordLayouts: Map<string, WasmRecordLayout>): WasmValueType {
	if (typeNameToString(typeName) === 'number') {
		return 'f64'
	}
	if (typeNameToString(typeName) === 'boolean') {
		return 'i32'
	}
	if (isNumberArrayType(typeName)) {
		return 'i32'
	}
	const source = typeNameToString(typeName)
	if (source.endsWith('[]') && recordLayouts.has(source.slice(0, -2))) {
		return 'i32'
	}

	throw new Error(`Wasm lowering does not support parameter type ${source}`)
}

function getWasmResultType(typeName: TypeName): WasmValueType {
	const source = typeNameToString(typeName)
	switch (source) {
		case 'number':
			return 'f64'
		case 'boolean':
			return 'i32'
		default:
			throw new Error(`Wasm lowering only supports number/boolean return type, got ${source}`)
	}
}

function getRecordArrayLayout(typeName: TypeName, context: ModuleLoweringContext): WasmRecordLayout | null {
	const source = typeNameToString(typeName)
	if (!source.endsWith('[]')) {
		return null
	}
	const recordName = source.slice(0, -2)

	return context.recordLayouts.get(recordName) ?? null
}

function isNumberArrayType(typeName: TypeName): boolean {
	return typeNameToString(typeName) === 'number[]'
}

function getWasmLocalType(typeName: TypeName, context: string): WasmValueType {
	const source = typeNameToString(typeName)
	switch (source) {
		case 'number':
			return 'f64'
		case 'boolean':
			return 'i32'
		default:
			throw new Error(`Wasm lowering only supports number/boolean locals for ${context}`)
	}
}

function assertNumberType(typeName: TypeName, context: string): void {
	const source = typeNameToString(typeName)
	if (source !== 'number') {
		throw new Error(`Wasm lowering only supports number type for ${context}`)
	}
}

export {
	type WasmLoweringOptions,
	lowerProgramToWasmIr,
}
