import {
	type ExpressionNode,
	type ProgramNode,
	type StatementNode,
} from '../ast'
import {type Token} from '../token'
import {buildCurrentZephyrArtifacts} from './currentArtifacts'
import {type ParseOptions, TableParser} from './TableParser'

class LalrAstParser {
	private readonly parser: TableParser<Token>
	private readonly parseOptions: ParseOptions<Token>

	constructor(private readonly tokens: Token[]) {
		const {tables, semanticActions} = buildCurrentZephyrArtifacts()
		this.parser = new TableParser<Token>(tables)
		this.parseOptions = {
			semanticActions,
			tokenToDebugName: token => token.type,
		}
	}

	parseProgram(): ProgramNode {
		return this.parser.parse(this.tokens, this.parseOptions) as ProgramNode
	}
}

export {
	LalrAstParser,
	ProgramNode,
	StatementNode,
	ExpressionNode,
}
