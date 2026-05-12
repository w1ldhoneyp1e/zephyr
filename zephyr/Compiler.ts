import {type VmProgram} from '../vm/types'
import {BytecodeGenerator} from './bytecode/BytecodeGenerator'
import {Lexer} from './Lexer'
import {LalrAstParser} from './parser/LalrAstParser'

class Compiler {
	compile(source: string): VmProgram[] {
		const lexer = new Lexer(source)
		const tokens = lexer.scanTokens()
		const parser = new LalrAstParser(tokens)
		const program = parser.parseProgram()
		const generator = new BytecodeGenerator()

		return generator.generate(program)
	}
}

export {
	Compiler,
}
