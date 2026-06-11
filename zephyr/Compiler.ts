import {type VmProgram} from '../vm/types'
import {type ProgramNode} from './ast'
import {BytecodeGenerator} from './bytecode/BytecodeGenerator'
import {
	type Diagnostic,
	DiagnosticError,
	DiagnosticReporter,
	diagnosticToMessage,
	NodeLocations,
} from './diagnostics'
import {Lexer} from './Lexer'
import {ModuleLoader} from './modules/ModuleLoader'
import {LalrAstParser} from './parser/LalrAstParser'
import {Resolver, Validator} from './semantics'

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

interface CompilationContext {
	reporter: DiagnosticReporter,
	nodeLocations: NodeLocations,
}

class Compiler {
	compilePath(filePath: string): CompileResult {
		const context = this.createCompilationContext()
		try {
			const loader = new ModuleLoader((source, sourceFile) => this.parseSource(source, sourceFile, context))
			const program = loader.loadEntryProgram(filePath)
			const programs = this.compileProgram(program, context)
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

	private compileProgram(program: ProgramNode, context: CompilationContext): VmProgram[] {
		const resolver = new Resolver(context.reporter, context.nodeLocations)
		const {program: resolvedProgram, model} = resolver.resolveProgram(program)
		if (context.reporter.hasErrors()) {
			return []
		}
		const validator = new Validator(context.nodeLocations, context.reporter)
		const validatedProgram = validator.validateProgram(resolvedProgram, model)
		if (context.reporter.hasErrors()) {
			return []
		}
		const generator = new BytecodeGenerator()

		return generator.generate(validatedProgram, model)
	}

	private parseSource(source: string, filePath: string, context: CompilationContext): ProgramNode {
		const lexer = new Lexer(source)
		const tokens = lexer.scanTokens()
		const parser = new LalrAstParser(tokens, filePath, context.nodeLocations)

		return parser.parseProgram()
	}

	private createCompilationContext(): CompilationContext {
		return {
			reporter: new DiagnosticReporter(),
			nodeLocations: new NodeLocations(),
		}
	}
}

export {
	type CompileResult,
	Compiler,
	diagnosticToMessage,
}
