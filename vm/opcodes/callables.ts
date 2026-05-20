import {type BuiltinGlobalName} from '../../zephyr/builtins'
import {
	type NativeImplementation,
	assertNativeArity,
	invokeNative,
	isNative,
} from '../nativeRuntime'
import {
	type ClosureInstruction,
	type LocalCell,
	type VmBoundMethod,
	type VmClosure,
	type VmFunctionTemplate,
	type VmStructTemplate,
	type VmSuperObject,
	Opcode,
} from '../types'
import {
	type CallFrame,
	type Instruction,
	type Value,
	type VmProgram,
	type VmRuntimeContext,
} from './context'

interface CallableEnvironment {
	natives: Map<BuiltinGlobalName, NativeImplementation>,
	programs: VmProgram[],
	makeLocals: (count: number) => LocalCell[],
	pushFrame: (frame: CallFrame) => void,
}

function execCallableOpcode(
	instr: Instruction,
	frame: CallFrame,
	runtime: VmRuntimeContext,
	environment: CallableEnvironment,
): boolean {
	const {
		constants,
		push,
		pop,
	} = runtime
	const {
		natives,
	} = environment
	switch (instr.op) {
		case Opcode.Call: {
			const argc = instr.arg!
			const callee = pop()
			const args: Value[] = []
			for (let i = 0; i < argc; i++) {
				args.unshift(pop())
			}
			if (isBoundMethod(callee)) {
				const methodArgs = [callee.receiver, ...args]
				if (isNative(callee.method)) {
					assertNativeArity(callee.method, methodArgs.length)
					push(invokeNative(natives, callee.method, methodArgs))
					return true
				}
				return callClosure(callee.method, methodArgs, environment)
			}
			if (isSuperObject(callee)) {
				return callClassTemplate({
					structTemplate: callee.classTemplate,
					receiver: callee.receiver,
					args,
					environment,
					push,
				})
			}
			if (isNative(callee)) {
				assertNativeArity(callee, argc)
				push(invokeNative(natives, callee, args))
				return true
			}
			if (isStructTemplate(callee)) {
				const receiver = instantiateStruct(callee)
				return callClassTemplate({
					structTemplate: callee,
					receiver,
					args,
					environment,
					push,
				})
			}
			if (!isClosure(callee)) {
				throw new Error('call: ожидалось замыкание')
			}
			return callClosure(callee, args, environment)
		}
		case Opcode.Closure: {
			const closureInstruction = instr as ClosureInstruction
			const templateRaw = constants[closureInstruction.functionConstIndex]
			if (
				templateRaw === undefined
				|| typeof templateRaw !== 'object'
				|| templateRaw === null
				|| !('kind' in templateRaw)
				|| templateRaw.kind !== 'function'
			) {
				throw new Error('closure: ожидался шаблон функции в константах')
			}
			const template = templateRaw as VmFunctionTemplate
			const cells: LocalCell[] = []
			for (const upvalue of closureInstruction.upvalues) {
				if (upvalue.isLocal) {
					const cell = frame.locals[upvalue.index]
					if (cell === undefined) {
						throw new Error(`closure: локальный слот ${upvalue.index}`)
					}
					cells.push(cell)
					continue
				}
				if (frame.closure === null) {
					throw new Error('closure: нет внешнего замыкания')
				}
				const parentCell = frame.closure.upvalues[upvalue.index]
				if (parentCell === undefined) {
					throw new Error(`closure: upvalue ${upvalue.index}`)
				}
				cells.push(parentCell)
			}
			if (cells.length !== template.upvalueCount) {
				throw new Error('closure: неверное число захватов')
			}
			push({
				kind: 'closure',
				template,
				upvalues: cells,
			})
			return true
		}
		default:
			return false
	}
}

function callClosure(
	closure: VmClosure,
	args: Value[],
	environment: CallableEnvironment,
): boolean {
	const {
		programs,
		makeLocals,
		pushFrame,
	} = environment
	const {template} = closure
	if (args.length !== template.arity) {
		throw new Error(`call: ожидалось ${template.arity} аргументов, получено ${args.length}`)
	}
	const program = programs[template.programIndex]
	if (program === undefined) {
		throw new Error(`call: нет программы #${template.programIndex}`)
	}
	const locals = makeLocals(program.localsCount)
	for (let i = 0; i < args.length; i++) {
		locals[i].value = args[i]
	}
	pushFrame({
		program,
		ip: 0,
		locals,
		closure,
	})
	return true
}

function instantiateStruct(structTemplate: VmStructTemplate): Value {
	const allFields = getAllFields(structTemplate)
	const properties: Record<string, Value> = {}
	for (let i = 0; i < allFields.length; i++) {
		properties[allFields[i]] = null
	}

	return {
		kind: 'object',
		typeName: structTemplate.name,
		structTemplate,
		properties,
	}
}

interface CallClassTemplateArgs {
	structTemplate: VmStructTemplate,
	receiver: Value,
	args: Value[],
	environment: CallableEnvironment,
	push: (value: Value) => void,
}

function callClassTemplate({
	structTemplate,
	receiver,
	args,
	environment,
	push,
}: CallClassTemplateArgs): boolean {
	const constructorMethod = structTemplate.constructorMethod
	if (constructorMethod === null) {
		if (args.length !== 0) {
			throw new Error(`call ${structTemplate.name}: ожидалось 0 аргументов, получено ${args.length}`)
		}
		push(receiver)
		return true
	}
	const constructorArgs = [receiver, ...args]
	if (isNative(constructorMethod)) {
		assertNativeArity(constructorMethod, constructorArgs.length)
		push(invokeNative(environment.natives, constructorMethod, constructorArgs))
		return true
	}
	return callClosure(constructorMethod, constructorArgs, environment)
}

function getAllFields(structTemplate: VmStructTemplate): string[] {
	return [
		...(structTemplate.baseClass === null
			? []
			: getAllFields(structTemplate.baseClass)),
		...structTemplate.fields,
	]
}

function isBoundMethod(value: Value): value is VmBoundMethod {
	return typeof value === 'object'
		&& value !== null
		&& 'kind' in value
		&& value.kind === 'bound_method'
}

function isClosure(value: Value): value is VmClosure {
	return typeof value === 'object'
		&& value !== null
		&& 'kind' in value
		&& value.kind === 'closure'
}

function isStructTemplate(value: Value): value is VmStructTemplate {
	return typeof value === 'object'
		&& value !== null
		&& 'kind' in value
		&& value.kind === 'struct'
}

function isSuperObject(value: Value): value is VmSuperObject {
	return typeof value === 'object'
		&& value !== null
		&& 'kind' in value
		&& value.kind === 'super_object'
}

export {
	execCallableOpcode,
}
