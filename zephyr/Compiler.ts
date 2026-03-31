import {type VmProgram} from '../vm/types'
import {BytecodeGenerator} from './BytecodeGenerator'
import {Lexer} from './Lexer'
import {Parser} from './Parser'

class Compiler {
	compile(source: string): VmProgram {
		const lexer = new Lexer(source)
		const tokens = lexer.scanTokens()
		const parser = new Parser(tokens)
		const program = parser.parseProgram()
		const generator = new BytecodeGenerator()

		return generator.generate(program)
	}
}

export {
	Compiler,
}
