import {type Production} from '../grammar'
import {
	type BlockStatementNode,
	type ExpressionNode,
	type FunctionDeclarationNode,
	type SemanticValueAction,
	createVariableDeclaration,
	ensureExpression,
	productionKey,
	tokenLexeme,
} from './context'

function createDeclarationAction(production: Production): SemanticValueAction | null {
	switch (productionKey(production)) {
		case 'VariableDeclaration -> Var Identifier VariableInitializerOpt Semicolon':
			return values => createVariableDeclaration('var', tokenLexeme(values[1]), values[2] as ExpressionNode | null)
		case 'VariableDeclaration -> Const Identifier VariableInitializerOpt Semicolon':
			return values => createVariableDeclaration('const', tokenLexeme(values[1]), values[2] as ExpressionNode | null)
		case 'VariableInitializerOpt -> Equal Expression':
			return values => ensureExpression(values[1], 'initializer')
		case 'VariableInitializerOpt -> ε':
			return () => null

		case 'FunctionDeclaration -> Fn Identifier LeftParen ParameterListOpt RightParen BlockStatement':
			return values => ({
				type: 'FunctionDeclaration',
				name: tokenLexeme(values[1]),
				params: values[3] as string[],
				body: values[5] as BlockStatementNode,
			} satisfies FunctionDeclarationNode)
		case 'ParameterListOpt -> ParameterList':
			return values => values[0]
		case 'ParameterListOpt -> ε':
			return () => []
		case 'ParameterList -> ParameterList Comma Identifier':
			return values => [...(values[0] as string[]), tokenLexeme(values[2])]
		case 'ParameterList -> Identifier':
			return values => [tokenLexeme(values[0])]

		default:
			return null
	}
}

export {
	createDeclarationAction,
}
