import {
	type ExpressionNode,
	type ProgramNode,
	type StatementNode,
} from '../ast'
import {type DiagnosticReporter, type NodeLocations} from '../diagnostics'
import {type Token} from '../token'
import {buildCurrentZephyrArtifacts} from './currentArtifacts'
import {type ParseOptions, TableParser} from './TableParser'

class LalrAstParser {
	private readonly parser: TableParser<Token>
	private readonly parseOptions: ParseOptions<Token>

	constructor(
		private readonly tokens: Token[],
		sourceFile?: string,
		nodeLocations?: NodeLocations,
		reporter?: DiagnosticReporter,
	) {
		const {tables, semanticActions} = buildCurrentZephyrArtifacts()
		this.parser = new TableParser<Token>(tables)
		this.parseOptions = {
			semanticActions,
			tokenToDebugName: token => token.type,
			sourceFile,
			nodeLocations,
			reporter,
		}
	}

	parseProgram(): ProgramNode | null {
		const result = this.parser.parse(this.tokens, this.parseOptions)

		return result === null
			? null
			: result as ProgramNode
	}
}

export {
	LalrAstParser,
	ProgramNode,
	StatementNode,
	ExpressionNode,
}
