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
	type VmClosure,
	type VmFunctionTemplate,
	type VmStructTemplate,
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
		programs,
		makeLocals,
		pushFrame,
	} = environment
	switch (instr.op) {
		case Opcode.Call: {
			const argc = instr.arg!
			const callee = pop()
			const args: Value[] = []
			for (let i = 0; i < argc; i++) {
				args.unshift(pop())
			}
			if (isNative(callee)) {
				assertNativeArity(callee, argc)
				push(invokeNative(natives, callee, args))
				return true
			}
			if (
				typeof callee === 'object'
				&& callee !== null
				&& 'kind' in callee
				&& callee.kind === 'struct'
			) {
				const structTemplate = callee as VmStructTemplate
				if (argc !== structTemplate.fields.length) {
					throw new Error(`call ${structTemplate.name}: ожидалось ${structTemplate.fields.length} аргументов, получено ${argc}`)
				}
				const properties: Record<string, Value> = {}
				for (let i = 0; i < structTemplate.fields.length; i++) {
					properties[structTemplate.fields[i]] = args[i] ?? null
				}
				push({
					kind: 'object',
					typeName: structTemplate.name,
					properties,
				})
				return true
			}
			if (
				typeof callee !== 'object'
				|| callee === null
				|| !('kind' in callee)
				|| callee.kind !== 'closure'
			) {
				throw new Error('call: ожидалось замыкание')
			}
			const closure = callee as VmClosure
			const {template} = closure
			if (argc !== template.arity) {
				throw new Error(`call: ожидалось ${template.arity} аргументов, получено ${argc}`)
			}
			const program = programs[template.programIndex]
			if (program === undefined) {
				throw new Error(`call: нет программы #${template.programIndex}`)
			}
			const locals = makeLocals(program.localsCount)
			for (let i = 0; i < argc; i++) {
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

export {
	execCallableOpcode,
}
