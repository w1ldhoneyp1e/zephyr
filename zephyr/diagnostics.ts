interface SourceLocation {
	filePath?: string,
	line: number,
	column: number,
}

interface Diagnostic {
	severity: 'error' | 'warning',
	message: string,
	location: SourceLocation | null,
}

type PhaseResult<TValue> =
	| {
		ok: true,
		value: TValue,
	}
	| {
		ok: false,
	}

class DiagnosticReporter {
	private readonly diagnostics: Diagnostic[] = []

	error(message: string, location: SourceLocation | null = null): void {
		this.diagnostics.push({
			severity: 'error',
			message,
			location,
		})
	}

	warning(message: string, location: SourceLocation | null = null): void {
		this.diagnostics.push({
			severity: 'warning',
			message,
			location,
		})
	}

	report(diagnostic: Diagnostic): void {
		this.diagnostics.push(diagnostic)
	}

	reportError(error: unknown, location: SourceLocation | null = null): void {
		this.report(diagnosticFromError(error, location))
	}

	hasErrors(): boolean {
		return this.diagnostics.some(diagnostic => diagnostic.severity === 'error')
	}

	getDiagnostics(): Diagnostic[] {
		return [...this.diagnostics]
	}
}

class NodeLocations {
	private readonly locations = new WeakMap<object, SourceLocation>()

	set(node: object, location: SourceLocation): void {
		this.locations.set(node, location)
	}

	get(node: object): SourceLocation | null {
		return this.locations.get(node) ?? null
	}
}

class DiagnosticError extends Error {
	constructor(
		readonly baseMessage: string,
		readonly location: SourceLocation | null = null,
	) {
		super(formatDiagnosticMessage(baseMessage, location))
		this.name = 'DiagnosticError'
	}
}

function diagnosticToMessage(diagnostic: Diagnostic): string {
	return formatDiagnosticMessage(diagnostic.message, diagnostic.location)
}

function diagnosticFromError(error: unknown, location: SourceLocation | null): Diagnostic {
	if (error instanceof DiagnosticError) {
		return {
			severity: 'error',
			message: error.baseMessage,
			location: error.location ?? location,
		}
	}
	if (error instanceof Error) {
		return {
			severity: 'error',
			message: error.message,
			location,
		}
	}

	return {
		severity: 'error',
		message: String(error),
		location,
	}
}

function toDiagnosticError(error: unknown, location: SourceLocation | null): DiagnosticError {
	if (error instanceof DiagnosticError) {
		if (error.location === null && location !== null) {
			return new DiagnosticError(error.message, location)
		}
		return error
	}
	if (error instanceof Error) {
		return new DiagnosticError(error.message, location)
	}

	return new DiagnosticError(String(error), location)
}

function formatDiagnosticMessage(message: string, location: SourceLocation | null): string {
	if (location === null) {
		return message
	}
	const filePrefix = location.filePath === undefined
		? ''
		: `${location.filePath}:`

	return `${filePrefix}${location.line}:${location.column}: ${message}`
}

export {
	type Diagnostic,
	DiagnosticError,
	DiagnosticReporter,
	NodeLocations,
	type PhaseResult,
	type SourceLocation,
	diagnosticFromError,
	diagnosticToMessage,
	toDiagnosticError,
}
