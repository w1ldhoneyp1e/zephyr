const BUILTIN_GLOBALS = [
	'read',
	'readf',
	'print',
	'printf',
] as const

type BuiltinGlobalName = typeof BUILTIN_GLOBALS[number]

function isBuiltinGlobalName(name: string): name is BuiltinGlobalName {
	return BUILTIN_GLOBALS.includes(name as BuiltinGlobalName)
}

export {
	type BuiltinGlobalName,
	BUILTIN_GLOBALS,
	isBuiltinGlobalName,
}
