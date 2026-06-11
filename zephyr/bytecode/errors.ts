function compilerInvariant(message: string): never {
	throw new Error(`Internal compiler error: ${message}`)
}

export {
	compilerInvariant,
}
