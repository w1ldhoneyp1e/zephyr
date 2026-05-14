import {type Production} from '../grammar'
import {
	type BlockStatementNode,
	type ClassDeclarationNode,
	type ClassFieldNode,
	type ExpressionNode,
	type FunctionDeclarationNode,
	type MethodDeclarationNode,
	type SemanticValueAction,
	type StructMemberListValue,
	type TypeName,
	createTypeName,
	createVariableDeclaration,
	ensureExpression,
	productionKey,
	tokenLexeme,
} from './context'

function createDeclarationAction(production: Production): SemanticValueAction | null {
	switch (productionKey(production)) {
		case 'VariableDeclaration -> Var Identifier TypeAnnotationOpt VariableInitializerOpt Semicolon':
			return values => createVariableDeclaration(
				'var',
				tokenLexeme(values[1]),
				createTypeName(values[2]),
				values[3] as ExpressionNode | null,
			)
		case 'VariableDeclaration -> Const Identifier TypeAnnotationOpt VariableInitializerOpt Semicolon':
			return values => createVariableDeclaration(
				'const',
				tokenLexeme(values[1]),
				createTypeName(values[2]),
				values[3] as ExpressionNode | null,
			)
		case 'TypeAnnotationOpt -> Colon Identifier':
			return values => tokenLexeme(values[1]) as TypeName
		case 'TypeAnnotationOpt -> ε':
			return () => 'any'
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

		case 'ClassDeclaration -> Class Identifier LeftBrace StructMemberListOpt RightBrace':
			return values => ({
				type: 'ClassDeclaration',
				name: tokenLexeme(values[1]),
				fields: (values[3] as StructMemberListValue).fields,
				methods: (values[3] as StructMemberListValue).methods,
			} satisfies ClassDeclarationNode)
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
		case 'StructMember -> FieldDeclaration':
			return values => ({
				fields: [values[0] as ClassFieldNode],
				methods: [],
			} satisfies StructMemberListValue)
		case 'FieldDeclaration -> Identifier TypeAnnotationOpt Semicolon':
			return values => ({
				name: tokenLexeme(values[0]),
				typeName: createTypeName(values[1]),
			} satisfies ClassFieldNode)
		case 'StructMember -> MethodDeclaration':
			return values => ({
				fields: [],
				methods: [values[0] as MethodDeclarationNode],
			} satisfies StructMemberListValue)

		default:
			return null
	}
}

export {
	createDeclarationAction,
}
