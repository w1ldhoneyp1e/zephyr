import {
	type ArrayExpressionNode,
	type AssignmentStatementNode,
	type AssignmentTargetNode,
	type BinaryExpressionNode,
	type BlockStatementNode,
	type BreakStatementNode,
	type CallExpressionNode,
	type ChooseExpressionNode,
	type ClassDeclarationNode,
	type ClassFieldNode,
	type ClassMemberVisibility,
	type CollectExpressionNode,
	type ConditionalBranchNode,
	type ConstructorDeclarationNode,
	type ContinueStatementNode,
	type ExportStatementNode,
	type ExpressionNode,
	type ExpressionStatementNode,
	type ForRangeStatementNode,
	type FunctionDeclarationNode,
	type IdentifierExpressionNode,
	type IdentifierTargetNode,
	type IfStatementNode,
	type ImportStatementNode,
	type IndexExpressionNode,
	type IndexTargetNode,
	type LambdaExpressionNode,
	type LiteralExpressionNode,
	type MatchByBranchNode,
	type MatchByExpressionNode,
	type MatchByPatternNode,
	type MatchExpressionNode,
	type MatchValueBranchNode,
	type MemberExpressionNode,
	type MemberTargetNode,
	type MethodDeclarationNode,
	type NamedExportStatementNode,
	type OptionalIndexExpressionNode,
	type OptionalMemberExpressionNode,
	type ParameterNode,
	type ProgramNode,
	type ReturnStatementNode,
	type StatementNode,
	type TypeAliasDeclarationNode,
	type TypeName,
	type UnaryExpressionNode,
	type VariableDeclarationNode,
	type WhileStatementNode,
} from '../../ast'
import {type Token} from '../../token'
import {type Production} from '../grammar'

type SemanticValue =
	| null
	| string
	| number
	| boolean
	| ParameterNode[]
	| ClassFieldNode
	| ParameterNode
	| TypeName[]
	| ExpressionNode[]
	| ConditionalBranchNode
	| ConditionalBranchNode[]
	| MatchValueBranchNode
	| MatchValueBranchNode[]
	| MatchByBranchNode
	| MatchByBranchNode[]
	| MatchByPatternNode
	| ChooseBranchesValue
	| MatchValueBranchesValue
	| MatchByBranchesValue
	| StructMemberListValue
	| ProgramNode
	| ExpressionNode
	| LambdaExpressionNode
	| MethodDeclarationNode
	| ConstructorDeclarationNode
	| TypeAliasDeclarationNode
	| StatementNode
	| StatementNode[]
	| PendingAssignmentNode
	| ImportStatementNode
	| ExportStatementNode
	| NamedExportStatementNode

interface PendingAssignmentNode {
	type: 'PendingAssignment',
	target: ExpressionNode,
	value: ExpressionNode,
}

interface ChooseBranchesValue {
	branches: ConditionalBranchNode[],
	defaultValue: ExpressionNode,
}

interface MatchValueBranchesValue {
	branches: MatchValueBranchNode[],
	defaultValue: ExpressionNode | null,
}

interface MatchByBranchesValue {
	branches: MatchByBranchNode[],
	defaultValue: ExpressionNode | null,
}

interface StructMemberListValue {
	fields: ClassFieldNode[],
	constructorDeclaration: ConstructorDeclarationNode | null,
	methods: MethodDeclarationNode[],
}

type SemanticValueAction = (values: SemanticValue[]) => SemanticValue

function createVariableDeclaration(
	kind: 'var' | 'const',
	name: string,
	typeName: TypeName,
	initializer: ExpressionNode | null,
): VariableDeclarationNode {
	return {
		type: 'VariableDeclaration',
		kind,
		name,
		typeName,
		initializer,
	}
}

function createTypeName(value: SemanticValue): TypeName {
	return typeof value === 'string'
		? value
		: 'any'
}

function appendArrayTypeSuffix(baseTypeName: TypeName): TypeName {
	return `${baseTypeName}[]`
}

function createFunctionTypeName(paramTypeNames: TypeName[], returnTypeName: TypeName): TypeName {
	return `(${paramTypeNames.join(', ')}) => ${returnTypeName}`
}

function createBinary(
	operator: BinaryExpressionNode['operator'],
	left: SemanticValue,
	right: SemanticValue,
): BinaryExpressionNode {
	return {
		type: 'BinaryExpression',
		operator,
		left: ensureExpression(left, `left operand for ${operator}`),
		right: ensureExpression(right, `right operand for ${operator}`),
	}
}

function createUnary(
	operator: UnaryExpressionNode['operator'],
	argument: SemanticValue,
): UnaryExpressionNode {
	return {
		type: 'UnaryExpression',
		operator,
		argument: ensureExpression(argument, `argument for ${operator}`),
	}
}

function ensureExpression(value: SemanticValue, context: string): ExpressionNode {
	if (value !== null && typeof value === 'object' && 'type' in value) {
		if (value.type === 'PendingAssignment') {
			throw new Error(`Присваивание недопустимо в контексте: ${context}`)
		}
		if (isExpressionNodeType(value.type)) {
			return value as ExpressionNode
		}
	}
	throw new Error(`Ожидалось выражение в контексте: ${context}`)
}

function expressionToAssignmentTarget(expression: ExpressionNode): AssignmentTargetNode {
	if (expression.type === 'IdentifierExpression') {
		return {
			type: 'IdentifierTarget',
			name: expression.name,
		} satisfies IdentifierTargetNode
	}
	if (expression.type === 'IndexExpression') {
		return {
			type: 'IndexTarget',
			object: expression.object,
			index: expression.index,
		} satisfies IndexTargetNode
	}
	if (expression.type === 'MemberExpression') {
		return {
			type: 'MemberTarget',
			object: expression.object,
			property: expression.property,
		} satisfies MemberTargetNode
	}
	throw new Error(`Недопустимая цель присваивания: ${expression.type}`)
}

function tokenLexeme(value: SemanticValue): string {
	if (value !== null && typeof value === 'object' && 'lexeme' in value) {
		return (value as unknown as Token).lexeme
	}
	throw new Error('Ожидался токен с lexeme')
}

function unquoteString(raw: string): string {
	return raw.slice(1, raw.length - 1)
}

function isPendingAssignment(value: SemanticValue): value is PendingAssignmentNode {
	return value !== null
		&& typeof value === 'object'
		&& 'type' in value
		&& value.type === 'PendingAssignment'
}

function isExpressionNodeType(type: string): boolean {
	return type === 'LiteralExpression'
		|| type === 'IdentifierExpression'
		|| type === 'UnaryExpression'
		|| type === 'BinaryExpression'
		|| type === 'ArrayExpression'
		|| type === 'IndexExpression'
		|| type === 'OptionalIndexExpression'
		|| type === 'MemberExpression'
		|| type === 'OptionalMemberExpression'
		|| type === 'CallExpression'
		|| type === 'LambdaExpression'
		|| type === 'ChooseExpression'
		|| type === 'CollectExpression'
		|| type === 'MatchExpression'
		|| type === 'MatchByExpression'
}

function productionKey(production: Production): string {
	return `${production.lhs} -> ${production.rhs.length === 0
		? 'ε'
		: production.rhs.join(' ')}`
}

export {
	type ArrayExpressionNode,
	type AssignmentStatementNode,
	type BlockStatementNode,
	type BreakStatementNode,
	type CallExpressionNode,
	type ClassMemberVisibility,
	type ClassFieldNode,
	type ClassDeclarationNode,
	type ChooseExpressionNode,
	type CollectExpressionNode,
	type ContinueStatementNode,
	type ConstructorDeclarationNode,
	type ConditionalBranchNode,
	type ExportStatementNode,
	type ExpressionNode,
	type ExpressionStatementNode,
	type ForRangeStatementNode,
	type FunctionDeclarationNode,
	type IdentifierExpressionNode,
	type IfStatementNode,
	type ImportStatementNode,
	type IndexExpressionNode,
	type LiteralExpressionNode,
	type LambdaExpressionNode,
	type MemberExpressionNode,
	type MethodDeclarationNode,
	type MatchByBranchNode,
	type MatchByBranchesValue,
	type MatchByExpressionNode,
	type MatchByPatternNode,
	type MatchExpressionNode,
	type MatchValueBranchesValue,
	type MatchValueBranchNode,
	type NamedExportStatementNode,
	type OptionalIndexExpressionNode,
	type OptionalMemberExpressionNode,
	type PendingAssignmentNode,
	type ParameterNode,
	type ProgramNode,
	type ChooseBranchesValue,
	type ReturnStatementNode,
	type SemanticValue,
	type SemanticValueAction,
	type StatementNode,
	type StructMemberListValue,
	type TypeAliasDeclarationNode,
	type TypeName,
	type VariableDeclarationNode,
	type WhileStatementNode,
	createFunctionTypeName,
	createTypeName,
	appendArrayTypeSuffix,
	createBinary,
	createUnary,
	createVariableDeclaration,
	ensureExpression,
	expressionToAssignmentTarget,
	isPendingAssignment,
	productionKey,
	tokenLexeme,
	unquoteString,
}
