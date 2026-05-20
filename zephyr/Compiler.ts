import {type VmProgram} from '../vm/types'
import {type ProgramNode} from './ast'
import {BytecodeGenerator} from './bytecode/BytecodeGenerator'
import {Lexer} from './Lexer'
import {ModuleLoader} from './modules/ModuleLoader'
import {LalrAstParser} from './parser/LalrAstParser'
import {Resolver, Validator} from './semantics'

class Compiler {
	compile(source: string): VmProgram[] {
		return this.compileProgram(this.parseSource(source))
	}

	compilePath(filePath: string): VmProgram[] {
		const loader = new ModuleLoader(source => this.parseSource(source))
		const program = loader.loadEntryProgram(filePath)

		return this.compileProgram(program)
	}

	private compileProgram(program: ProgramNode): VmProgram[] {
		const loader = new ModuleLoader(source => this.parseSource(source))
		const normalizedProgram = loader.normalizeProgram(program)
		const resolver = new Resolver()
		const {program: resolvedProgram, model} = resolver.resolveProgram(normalizedProgram)
		const validator = new Validator()
		const validatedProgram = validator.validateProgram(resolvedProgram, model)
		const generator = new BytecodeGenerator()

		return generator.generate(validatedProgram, model)
	}

	private parseSource(source: string): ProgramNode {
		const lexer = new Lexer(source)
		const tokens = lexer.scanTokens()
		const parser = new LalrAstParser(tokens)

		return parser.parseProgram()
	}
}

export {
	Compiler,
}
