import {type VmProgram} from '../vm/types'
import {BytecodeGenerator} from './bytecode/BytecodeGenerator'
import {Lexer} from './Lexer'
import {LalrAstParser} from './parser/LalrAstParser'
import {Resolver, Validator} from './semantics'

class Compiler {
	compile(source: string): VmProgram[] {
		const lexer = new Lexer(source)
		const tokens = lexer.scanTokens()
		const parser = new LalrAstParser(tokens)
		const program = parser.parseProgram()
		const resolver = new Resolver()
		const {program: resolvedProgram, model} = resolver.resolveProgram(program)
		const validator = new Validator()
		const validatedProgram = validator.validateProgram(resolvedProgram, model)
		const generator = new BytecodeGenerator()

		return generator.generate(validatedProgram)
	}
}

export {
	Compiler,
}
