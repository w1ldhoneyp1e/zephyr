import {type BytecodeGenerator} from '../BytecodeGenerator'
import {type CompilerState} from '../CompilerState'
import {type StatementNode} from '../context'
import {type FunctionCompiler} from '../FunctionCompiler'
import {emitStatement} from './statementEmitter'

function emitBlock(
	state: CompilerState,
	generator: BytecodeGenerator,
	compiler: FunctionCompiler,
	statements: StatementNode[],
): void {
	state.enterScope()
	for (const statement of statements) {
		emitStatement(state, generator, compiler, statement)
	}
	state.leaveScope()
}

export {
	emitBlock,
}
