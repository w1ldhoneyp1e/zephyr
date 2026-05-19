import {type Production} from '../grammar'
import {
	type BlockStatementNode,
	type ClassDeclarationNode,
	type ClassFieldNode,
	type ExportStatementNode,
	type ExpressionNode,
	type FunctionDeclarationNode,
	type ImportStatementNode,
	type MethodDeclarationNode,
	type NamedExportStatementNode,
	type ParameterNode,
	type SemanticValueAction,
	type StructMemberListValue,
	type TypeName,
	type VariableDeclarationNode,
	createFunctionTypeName,
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
		case 'ImportStatement -> Import LeftBrace ImportNameListOpt RightBrace From String Semicolon':
			return values => ({
				type: 'ImportStatement',
				names: values[2] as string[],
				source: tokenLexeme(values[5]).slice(1, -1),
			} satisfies ImportStatementNode)
		case 'ImportNameListOpt -> ImportNameList ImportTrailingCommaOpt':
			return values => values[0]
		case 'ImportNameListOpt -> ε':
			return () => []
		case 'ImportTrailingCommaOpt -> Comma':
		case 'ImportTrailingCommaOpt -> ε':
			return () => null
		case 'ImportNameList -> ImportNameList Comma Identifier':
			return values => [...(values[0] as string[]), tokenLexeme(values[2])]
		case 'ImportNameList -> Identifier':
			return values => [tokenLexeme(values[0])]
		case 'ExportStatement -> Export VariableDeclaration':
		case 'ExportStatement -> Export FunctionDeclaration':
		case 'ExportStatement -> Export ClassDeclaration':
			return values => ({
				type: 'ExportStatement',
				statement: values[1] as VariableDeclarationNode | FunctionDeclarationNode | ClassDeclarationNode,
			} satisfies ExportStatementNode)
		case 'ExportStatement -> Export LeftBrace ImportNameListOpt RightBrace ExportFromOpt Semicolon':
			return values => ({
				type: 'NamedExportStatement',
				names: values[2] as string[],
				source: values[4] as string | null,
			} satisfies NamedExportStatementNode)
		case 'ExportFromOpt -> From String':
			return values => tokenLexeme(values[1]).slice(1, -1)
		case 'ExportFromOpt -> ε':
			return () => null
		case 'TypeAnnotationOpt -> Colon TypeExpression':
			return values => createTypeName(values[1])
		case 'TypeAnnotationOpt -> ε':
			return () => 'any'
		case 'TypeExpression -> PrimaryTypeExpression TypeSuffixListOpt':
			return values => `${createTypeName(values[0])}${values[1] as string}`
		case 'PrimaryTypeExpression -> Identifier':
			return values => tokenLexeme(values[0]) as TypeName
		case 'PrimaryTypeExpression -> FunctionTypeExpression':
			return values => createTypeName(values[0])
		case 'FunctionTypeExpression -> LeftParen TypeArgumentListOpt RightParen Arrow TypeExpression':
			return values => createFunctionTypeName(
				values[1] as TypeName[],
				createTypeName(values[4]),
			)
		case 'TypeArgumentListOpt -> TypeArgumentList TypeTrailingCommaOpt':
			return values => values[0]
		case 'TypeArgumentListOpt -> ε':
			return () => []
		case 'TypeTrailingCommaOpt -> Comma':
		case 'TypeTrailingCommaOpt -> ε':
			return () => null
		case 'TypeArgumentList -> TypeArgumentList Comma TypeExpression':
			return values => [...(values[0] as TypeName[]), createTypeName(values[2])]
		case 'TypeArgumentList -> TypeExpression':
			return values => [createTypeName(values[0])]
		case 'TypeSuffixListOpt -> TypeSuffixList':
			return values => values[0]
		case 'TypeSuffixListOpt -> ε':
			return () => ''
		case 'TypeSuffixList -> TypeSuffixList TypeSuffix':
			return values => `${values[0] as string}${values[1] as string}`
		case 'TypeSuffixList -> TypeSuffix':
			return values => values[0]
		case 'TypeSuffix -> LeftBracket RightBracket':
			return () => '[]'
		case 'VariableInitializerOpt -> Equal Expression':
			return values => ensureExpression(values[1], 'initializer')
		case 'VariableInitializerOpt -> ε':
			return () => null

		case 'FunctionDeclaration -> Fn Identifier LeftParen ParameterListOpt RightParen ReturnTypeOpt BlockStatement':
			return values => ({
				type: 'FunctionDeclaration',
				name: tokenLexeme(values[1]),
				params: values[3] as ParameterNode[],
				returnTypeName: createTypeName(values[5]),
				body: values[6] as BlockStatementNode,
			} satisfies FunctionDeclarationNode)
		case 'MethodDeclaration -> Fn Identifier LeftParen ParameterListOpt RightParen ReturnTypeOpt BlockStatement':
			return values => ({
				type: 'MethodDeclaration',
				name: tokenLexeme(values[1]),
				params: values[3] as ParameterNode[],
				returnTypeName: createTypeName(values[5]),
				body: values[6] as BlockStatementNode,
			} satisfies MethodDeclarationNode)
		case 'ReturnTypeOpt -> Colon TypeExpression':
			return values => createTypeName(values[1])
		case 'ReturnTypeOpt -> ε':
			return () => 'any'
		case 'ParameterListOpt -> ParameterList ParameterTrailingCommaOpt':
			return values => values[0]
		case 'ParameterListOpt -> ε':
			return () => []
		case 'ParameterTrailingCommaOpt -> Comma':
		case 'ParameterTrailingCommaOpt -> ε':
			return () => null
		case 'ParameterList -> ParameterList Comma Parameter':
			return values => [...(values[0] as ParameterNode[]), values[2] as ParameterNode]
		case 'ParameterList -> Parameter':
			return values => [values[0] as ParameterNode]
		case 'Parameter -> Identifier TypeAnnotationOpt':
			return values => ({
				name: tokenLexeme(values[0]),
				typeName: createTypeName(values[1]),
			} satisfies ParameterNode)

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
