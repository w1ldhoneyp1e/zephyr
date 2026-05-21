import {type Production} from '../grammar'
import {
	type BlockStatementNode,
	type ClassDeclarationNode,
	type ClassFieldNode,
	type ClassMemberVisibility,
	type ConstructorDeclarationNode,
	type ExportStatementNode,
	type ExpressionNode,
	type FunctionDeclarationNode,
	type ImportStatementNode,
	type MethodDeclarationNode,
	type NamedExportStatementNode,
	type ParameterNode,
	type SemanticValueAction,
	type StructMemberListValue,
	type TypeAliasDeclarationNode,
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
		case 'TypeAliasDeclaration -> Type Identifier Equal TypeExpression Semicolon':
			return values => ({
				type: 'TypeAliasDeclaration',
				name: tokenLexeme(values[1]),
				typeName: createTypeName(values[3]),
			} satisfies TypeAliasDeclarationNode)
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
		case 'ExportStatement -> Export TypeAliasDeclaration':
		case 'ExportStatement -> Export FunctionDeclaration':
		case 'ExportStatement -> Export ClassDeclaration':
			return values => ({
				type: 'ExportStatement',
				statement: values[1] as VariableDeclarationNode
					| TypeAliasDeclarationNode
					| FunctionDeclarationNode
					| ClassDeclarationNode,
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
		case 'TypeExpression -> UnionTypeExpression':
		case 'UnionTypeExpression -> ArrayTypeExpression':
			return values => createTypeName(values[0])
		case 'UnionTypeExpression -> UnionTypeExpression Pipe ArrayTypeExpression':
			return values => `${createTypeName(values[0])} | ${createTypeName(values[2])}`
		case 'ArrayTypeExpression -> PrimaryTypeExpression TypeSuffixListOpt':
			return values => `${createTypeName(values[0])}${values[1] as string}`
		case 'PrimaryTypeExpression -> Identifier':
			return values => tokenLexeme(values[0]) as TypeName
		case 'PrimaryTypeExpression -> Null':
			return () => 'null'
		case 'PrimaryTypeExpression -> ParenthesizedTypeExpression':
		case 'PrimaryTypeExpression -> ObjectTypeExpression':
			return values => createTypeName(values[0])
		case 'ParenthesizedTypeExpression -> LeftParen TypeArgumentListOpt RightParen ParenthesizedTypeContinuation':
			return values => {
				const types = values[1] as TypeName[]
				const returnTypeName = values[3] as TypeName | null
				if (returnTypeName !== null) {
					return createFunctionTypeName(types, returnTypeName)
				}
				if (types.length !== 1) {
					throw new Error('В скобках типа без => ожидается ровно один тип')
				}
				return `(${createTypeName(types[0])})`
			}
		case 'ParenthesizedTypeContinuation -> Arrow TypeExpression':
			return values => createTypeName(values[1])
		case 'ParenthesizedTypeContinuation -> ε':
			return () => null
		case 'ObjectTypeExpression -> LeftBrace ObjectTypeMemberListOpt RightBrace':
			return values => `{${(values[1] as TypeName[]).join('')}}`
		case 'ObjectTypeMemberListOpt -> ObjectTypeMemberList':
			return values => values[0]
		case 'ObjectTypeMemberListOpt -> ε':
			return () => []
		case 'ObjectTypeMemberList -> ObjectTypeMemberList ObjectTypeMember':
			return values => [...(values[0] as TypeName[]), createTypeName(values[1])]
		case 'ObjectTypeMemberList -> ObjectTypeMember':
			return values => [createTypeName(values[0])]
		case 'ObjectTypeMember -> Identifier Colon TypeExpression Semicolon':
			return values => `${tokenLexeme(values[0])}: ${createTypeName(values[2])};`
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

		case 'FunctionDeclaration -> Fn Identifier TypeParameterListOpt LeftParen ParameterListOpt RightParen ReturnTypeOpt BlockStatement':
			return values => ({
				type: 'FunctionDeclaration',
				name: tokenLexeme(values[1]),
				typeParams: values[2] as string[],
				params: values[4] as ParameterNode[],
				returnTypeName: createTypeName(values[6]),
				body: values[7] as BlockStatementNode,
			} satisfies FunctionDeclarationNode)
		case 'TypeParameterListOpt -> Less TypeParameterList Greater':
			return values => values[1]
		case 'TypeParameterListOpt -> ε':
			return () => []
		case 'TypeParameterList -> TypeParameterList Comma Identifier':
			return values => [...(values[0] as string[]), tokenLexeme(values[2])]
		case 'TypeParameterList -> Identifier':
			return values => [tokenLexeme(values[0])]
		case 'MethodDeclaration -> VisibilityOpt Fn Identifier LeftParen ParameterListOpt RightParen ReturnTypeOpt BlockStatement':
			return values => ({
				type: 'MethodDeclaration',
				visibility: values[0] as ClassMemberVisibility,
				name: tokenLexeme(values[2]),
				params: values[4] as ParameterNode[],
				returnTypeName: createTypeName(values[6]),
				body: values[7] as BlockStatementNode,
			} satisfies MethodDeclarationNode)
		case 'ConstructorDeclaration -> Constructor LeftParen ParameterListOpt RightParen BlockStatement':
			return values => ({
				type: 'ConstructorDeclaration',
				params: values[2] as ParameterNode[],
				body: values[4] as BlockStatementNode,
			} satisfies ConstructorDeclarationNode)
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

		case 'ClassDeclaration -> Class Identifier ClassExtendsOpt LeftBrace StructMemberListOpt RightBrace':
			return values => ({
				type: 'ClassDeclaration',
				name: tokenLexeme(values[1]),
				baseClassName: values[2] as string | null,
				fields: (values[4] as StructMemberListValue).fields,
				constructorDeclaration: (values[4] as StructMemberListValue).constructorDeclaration,
				methods: (values[4] as StructMemberListValue).methods,
			} satisfies ClassDeclarationNode)
		case 'ClassExtendsOpt -> Extends Identifier':
			return values => tokenLexeme(values[1])
		case 'ClassExtendsOpt -> ε':
			return () => null
		case 'VisibilityOpt -> Public':
			return () => 'public'
		case 'VisibilityOpt -> Private':
			return () => 'private'
		case 'VisibilityOpt -> ε':
			return () => 'public'
		case 'StructMemberListOpt -> StructMemberList':
			return values => values[0]
		case 'StructMemberListOpt -> ε':
			return () => ({
				fields: [],
				constructorDeclaration: null,
				methods: [],
			} satisfies StructMemberListValue)
		case 'StructMemberList -> StructMemberList StructMember':
			return values => {
				const list = values[0] as StructMemberListValue
				const member = values[1] as StructMemberListValue
				if (list.constructorDeclaration !== null && member.constructorDeclaration !== null) {
					throw new Error('В классе можно объявить только один constructor')
				}

				return {
					fields: [...list.fields, ...member.fields],
					constructorDeclaration: member.constructorDeclaration ?? list.constructorDeclaration,
					methods: [...list.methods, ...member.methods],
				} satisfies StructMemberListValue
			}
		case 'StructMemberList -> StructMember':
			return values => values[0]
		case 'StructMember -> FieldDeclaration':
			return values => ({
				fields: [values[0] as ClassFieldNode],
				constructorDeclaration: null,
				methods: [],
			} satisfies StructMemberListValue)
		case 'FieldDeclaration -> VisibilityOpt Identifier TypeAnnotationOpt Semicolon':
			return values => ({
				visibility: values[0] as ClassMemberVisibility,
				name: tokenLexeme(values[1]),
				typeName: createTypeName(values[2]),
			} satisfies ClassFieldNode)
		case 'StructMember -> MethodDeclaration':
			return values => ({
				fields: [],
				constructorDeclaration: null,
				methods: [values[0] as MethodDeclarationNode],
			} satisfies StructMemberListValue)
		case 'StructMember -> ConstructorDeclaration':
			return values => ({
				fields: [],
				constructorDeclaration: values[0] as ConstructorDeclarationNode,
				methods: [],
			} satisfies StructMemberListValue)

		default:
			return null
	}
}

export {
	createDeclarationAction,
}
