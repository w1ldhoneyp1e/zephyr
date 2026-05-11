import {
	type ExpressionNode,
	type ProgramNode,
	type StatementNode,
} from '../ast'
import {type Token} from '../token'
import {LalrGenerator} from './LalrGenerator'
import {createSemanticActions} from './semanticActions'
import {type ParseOptions, TableParser} from './TableParser'
import {createCurrentZephyrGrammar} from './ZephyrGrammar'

class LalrAstParser {
	private readonly parser: TableParser<Token>
	private readonly parseOptions: ParseOptions<Token>

	constructor(private readonly tokens: Token[]) {
		const grammar = createCurrentZephyrGrammar()
		const tables = new LalrGenerator(grammar).buildParsingTables()
		this.parser = new TableParser<Token>(tables)
		this.parseOptions = {
			semanticActions: createSemanticActions(grammar),
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
