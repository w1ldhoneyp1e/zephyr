import {type Production} from '../grammar'
import {
	type BlockStatementNode,
	type ExpressionNode,
	type FunctionDeclarationNode,
	type MethodDeclarationNode,
	type SemanticValueAction,
	type StructDeclarationNode,
	type StructMemberListValue,
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
		case 'MethodDeclaration -> Fn Identifier LeftParen ParameterListOpt RightParen BlockStatement':
			return values => ({
				type: 'MethodDeclaration',
				name: tokenLexeme(values[1]),
				params: values[3] as string[],
				body: values[5] as BlockStatementNode,
			} satisfies MethodDeclarationNode)
		case 'ParameterListOpt -> ParameterList':
			return values => values[0]
		case 'ParameterListOpt -> ε':
			return () => []
		case 'ParameterList -> ParameterList Comma Identifier':
			return values => [...(values[0] as string[]), tokenLexeme(values[2])]
		case 'ParameterList -> Identifier':
			return values => [tokenLexeme(values[0])]

		case 'StructDeclaration -> Struct Identifier LeftBrace StructMemberListOpt RightBrace':
			return values => ({
				type: 'StructDeclaration',
				name: tokenLexeme(values[1]),
				fields: (values[3] as StructMemberListValue).fields,
				methods: (values[3] as StructMemberListValue).methods,
			} satisfies StructDeclarationNode)
		case 'StructMemberListOpt -> StructMemberList':
			return values => values[0]
		case 'StructMemberListOpt -> ε':
			return () => ({
				fields: [],
				methods: [],
			} satisfies StructMemberListValue)
		case 'StructMemberList -> StructMemberList StructMember':
			return values => {
				const list = values[0] as StructMemberListValue
				const member = values[1] as StructMemberListValue

				return {
					fields: [...list.fields, ...member.fields],
					methods: [...list.methods, ...member.methods],
				} satisfies StructMemberListValue
			}
		case 'StructMemberList -> StructMember':
			return values => values[0]
		case 'StructMember -> Identifier StructFieldSeparatorOpt':
			return values => ({
				fields: [tokenLexeme(values[0])],
				methods: [],
			} satisfies StructMemberListValue)
		case 'StructMember -> MethodDeclaration':
			return values => ({
				fields: [],
				methods: [values[0] as MethodDeclarationNode],
			} satisfies StructMemberListValue)
		case 'StructFieldSeparatorOpt -> Comma':
		case 'StructFieldSeparatorOpt -> ε':
			return () => null

		default:
			return null
	}
}

export {
	createDeclarationAction,
}
