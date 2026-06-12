import * as fs from 'fs'
import {type BuiltinGlobalName, BUILTIN_GLOBALS} from '../zephyr/builtins'
import {choose, match} from '../zephyr/utils'
import {formatValue} from './formatValue'
import {type Value, type VmNative} from './types'

type NativeImplementation = (args: Value[]) => Value

interface NativeEnvironment {
	read: () => Value,
	write: (text: string) => void,
}

interface NativeRegistry {
	globals: Map<string, Value>,
	natives: Map<BuiltinGlobalName, NativeImplementation>,
}

function createNativeRegistry(environment: NativeEnvironment): NativeRegistry {
	const globals = new Map<string, Value>()
	const natives = new Map<BuiltinGlobalName, NativeImplementation>([
		['read', () => environment.read()],
		['number', args => {
			const value = args[0] ?? null
			const converted = Number(value)
			if (Number.isNaN(converted)) {
				return null
			}

			return converted
		}],
		['string', args => formatValue(args[0] ?? null)],
		['readf', args => {
			const pathValue = requireStringArg('readf', 0, 1, args)
			return fs.readFileSync(pathValue, 'utf-8')
		}],
		['print', args => {
			environment.write(`${formatValue(args[0] ?? null)}\n`)

			return null
		}],
		['printf', args => {
			const filePath = requireStringArg('printf', 0, 2, args)
			const content = formatValue(args[1] ?? null)
			fs.writeFileSync(filePath, content)

			return null
		}],
	])

	for (const name of BUILTIN_GLOBALS) {
		const nativeConfig = match(name, {
			print: {
				arity: 1,
				minArity: 1,
			},
			readf: {
				arity: 1,
				minArity: 1,
			},
			printf: {
				arity: 2,
				minArity: 2,
			},
			read: {
				arity: 0,
				minArity: 0,
			},
			number: {
				arity: 1,
				minArity: 1,
			},
			string: {
				arity: 1,
				minArity: 1,
			},
		})
		globals.set(name, {
			kind: 'native',
			name,
			arity: nativeConfig.arity,
			minArity: nativeConfig.minArity,
		} satisfies VmNative)
	}

	return {
		globals,
		natives,
	}
}

function isNative(value: Value): value is VmNative {
	return typeof value === 'object'
		&& value !== null
		&& 'kind' in value
		&& value.kind === 'native'
}

function assertNativeArity(nativeFn: VmNative, argc: number): void {
	const arityError = choose(
		[
			nativeFn.arity !== null && argc !== nativeFn.arity,
			`call ${nativeFn.name}: ожидалось ${nativeFn.arity} аргументов, получено ${argc}`,
		],
		[
			argc < nativeFn.minArity,
			`call ${nativeFn.name}: ожидалось минимум ${nativeFn.minArity} аргументов, получено ${argc}`,
		],
		null,
	)
	if (arityError !== null) {
		throw new Error(arityError)
	}
}

function invokeNative(
	natives: Map<BuiltinGlobalName, NativeImplementation>,
	nativeFn: VmNative,
	args: Value[],
): Value {
	const implementation = natives.get(nativeFn.name as BuiltinGlobalName)
	if (implementation === undefined) {
		throw new Error(`Неизвестная встроенная функция: ${nativeFn.name}`)
	}

	return implementation(args)
}

function requireStringArg(name: string, index: number, argc: number, args?: Value[]): string {
	const values = args ?? []
	const value = values[index]
	if (typeof value !== 'string') {
		throw new Error(`${name}: аргумент ${index + 1} из ${argc} должен быть строкой`)
	}

	return value
}

export {
	type NativeImplementation,
	type NativeRegistry,
	createNativeRegistry,
	assertNativeArity,
	invokeNative,
	isNative,
}
