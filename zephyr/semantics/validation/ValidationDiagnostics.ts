import {type ExpressionNode, type StatementNode} from '../../ast'
import {type DiagnosticReporter, type NodeLocations} from '../../diagnostics'

class ValidationDiagnostics {
	constructor(
		private readonly reporter: DiagnosticReporter,
		private readonly nodeLocations: NodeLocations,
	) {
	}

	reportForStatement(error: unknown, statement: StatementNode): void {
		this.reporter.reportError(error, this.nodeLocations.get(statement))
	}

	reportForExpression(error: unknown, expression: ExpressionNode): void {
		this.reporter.reportError(error, this.nodeLocations.get(expression))
	}

	runForStatement(statement: StatementNode, check: () => void): void {
		try {
			check()
		}
		catch (error) {
			this.reportForStatement(error, statement)
		}
	}

	runForExpression(expression: ExpressionNode, check: () => void): void {
		try {
			check()
		}
		catch (error) {
			this.reportForExpression(error, expression)
		}
	}
}

export {
	ValidationDiagnostics,
}
