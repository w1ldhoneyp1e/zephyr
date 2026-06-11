import {
	type ClassFieldNode,
	type ExpressionNode,
	type MethodDeclarationNode,
	type StatementNode,
} from '../../ast'
import {type DiagnosticReporter, type NodeLocations} from '../../diagnostics'

type ValidationDiagnosticNode =
	| StatementNode
	| ExpressionNode
	| ClassFieldNode
	| MethodDeclarationNode

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

	reportForNode(error: unknown, node: ValidationDiagnosticNode): void {
		this.reporter.reportError(error, this.nodeLocations.get(node))
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
