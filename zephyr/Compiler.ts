import * as path from 'path'
import {type VmProgram} from '../vm/types'
import {type ProgramNode} from './ast'
import {BytecodeGenerator} from './bytecode/BytecodeGenerator'
import {
	type Diagnostic,
	type PhaseResult,
	DiagnosticError,
	DiagnosticReporter,
	diagnosticToMessage,
	NodeLocations,
} from './diagnostics'
import {Lexer} from './Lexer'
import {ModuleLoader} from './modules/ModuleLoader'
import {LalrAstParser} from './parser/LalrAstParser'
import {Resolver, Validator} from './semantics'
import {type SemanticModel} from './semantics/context'

type CompileResult =
	| {
		ok: true,
		programs: VmProgram[],
		diagnostics: Diagnostic[],
	}
	| {
		ok: false,
		diagnostics: Diagnostic[],
	}

type CheckResult =
	| {
		ok: true,
		diagnostics: Diagnostic[],
	}
	| {
		ok: false,
		diagnostics: Diagnostic[],
	}

interface CompilationContext {
	reporter: DiagnosticReporter,
	nodeLocations: NodeLocations,
}

interface FrontendResult {
	ok: boolean,
	program: ProgramNode | null,
	model: SemanticModel | null,
	context: CompilationContext,
}

class Compiler {
	compilePath(filePath: string): CompileResult {
		const result = this.runFrontend(filePath)
		const context = result.context
		if (!result.ok || result.program === null || result.model === null) {
			return {
				ok: false,
				diagnostics: context.reporter.getDiagnostics(),
			}
		}
		try {
			const generator = new BytecodeGenerator(context.nodeLocations)
			const programs = generator.generate(result.program, result.model)
			if (context.reporter.hasErrors()) {
				return {
					ok: false,
					diagnostics: context.reporter.getDiagnostics(),
				}
			}

			return {
				ok: true,
				programs,
				diagnostics: context.reporter.getDiagnostics(),
			}
		}
		catch (error) {
			context.reporter.reportError(error)

			return {
				ok: false,
				diagnostics: context.reporter.getDiagnostics(),
			}
		}
	}

	checkPath(filePath: string): CheckResult {
		return this.toCheckResult(this.runFrontend(filePath))
	}

	checkSource(source: string, filePath: string): CheckResult {
		const sourceOverrides = new Map<string, string>([
			[this.resolvePath(filePath), source],
		])

		return this.toCheckResult(this.runFrontend(filePath, sourceOverrides))
	}

	run(filePath: string): VmProgram[] {
		const result = this.compilePath(filePath)
		if (result.ok) {
			return result.programs
		}
		const diagnostic = result.diagnostics[0]
		throw new DiagnosticError(
			diagnostic === undefined
				? 'Компиляция завершилась с ошибкой'
				: diagnostic.message,
			diagnostic?.location ?? null,
		)
	}

	private runFrontend(filePath: string, sourceOverrides: ReadonlyMap<string, string> = new Map()): FrontendResult {
		const context = this.createCompilationContext()
		try {
			const resolvedFilePath = this.resolvePath(filePath)
			const loader = new ModuleLoader(
				(source, sourceFile) => this.parseSource(source, sourceFile, context),
				context.reporter,
				context.nodeLocations,
				process.cwd(),
				sourceOverrides,
			)
			const programResult = loader.loadEntryProgram(resolvedFilePath)
			if (!programResult.ok) {
				return {
					ok: false,
					program: null,
					model: null,
					context,
				}
			}
			const validated = this.validateProgram(programResult.value, context)

			return {
				ok: !context.reporter.hasErrors(),
				program: validated.program,
				model: validated.model,
				context,
			}
		}
		catch (error) {
			context.reporter.reportError(error)

			return {
				ok: false,
				program: null,
				model: null,
				context,
			}
		}
	}

	private validateProgram(program: ProgramNode, context: CompilationContext): {
		program: ProgramNode,
		model: SemanticModel,
	} {
		const resolver = new Resolver(context.reporter, context.nodeLocations)
		const {program: resolvedProgram, model} = resolver.resolveProgram(program)
		const validator = new Validator(context.nodeLocations, context.reporter)

		return {
			program: validator.validateProgram(resolvedProgram, model),
			model,
		}
	}

	private parseSource(source: string, filePath: string, context: CompilationContext): PhaseResult<ProgramNode> {
		const lexer = new Lexer(source, context.reporter, filePath)
		const tokens = lexer.scanTokens()
		if (context.reporter.hasErrors()) {
			return {
				ok: false,
			}
		}
		const parser = new LalrAstParser(tokens, filePath, context.nodeLocations, context.reporter)

		return parser.parseProgram()
	}

	private createCompilationContext(): CompilationContext {
		return {
			reporter: new DiagnosticReporter(),
			nodeLocations: new NodeLocations(),
		}
	}

	private resolvePath(filePath: string): string {
		return path.resolve(filePath)
	}

	private toCheckResult(result: FrontendResult): CheckResult {
		return {
			ok: result.ok,
			diagnostics: result.context.reporter.getDiagnostics(),
		}
	}
}

export {
	type CheckResult,
	type CompileResult,
	Compiler,
	diagnosticToMessage,
}
