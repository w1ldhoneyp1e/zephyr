import {
	type AssignmentTargetNode,
	type ClassDeclarationNode,
	type ClassFieldNode,
	type ConstructorDeclarationNode,
	type ExpressionNode,
	type ForRangeStatementNode,
	type ForStatementNode,
	type FunctionDeclarationNode,
	type IdentifierExpressionNode,
	type IdentifierTargetNode,
	type LambdaExpressionNode,
	type MethodDeclarationNode,
	type ParameterNode,
	type ProgramNode,
	type StatementNode,
	type TypeAliasDeclarationNode,
	type TypeName,
	type VariableDeclarationNode,
	typeNameToString,
} from '../ast'
import {isBuiltinGlobalName} from '../builtins'
import {
	type DiagnosticReporter,
	type NodeLocations,
	type SourceLocation,
} from '../diagnostics'
import {
	type CallableDeclarationNode,
	type OwnedSemanticBinding,
	type SemanticBinding,
	type SemanticFunctionOwner,
	type SemanticLoopOwner,
	type SemanticModel,
	errorBinding,
} from './context'
import {
	errorType,
	parseSemanticType,
	removeNullFromType,
	typeParameterType,
	unionType,
} from './SemanticType'
import {getTypeErrorLocation} from './TypeDiagnostics'

interface ConditionNarrowing {
	name: string,
	binding: SemanticBinding,
	type: ReturnType<typeof parseSemanticType>,
}

type DiagnosticNode =
	| StatementNode
	| ExpressionNode
	| AssignmentTargetNode
	| ClassFieldNode
	| ParameterNode
	| MethodDeclarationNode
	| ConstructorDeclarationNode

class Resolver {
	private scopes: {
		bindings: Map<string, SemanticBinding>,
	}[] = []
	private functionOwners: SemanticFunctionOwner[] = []
	private loopOwners: SemanticLoopOwner[] = []
	private functionLoopSnapshots: SemanticLoopOwner[][] = []
	private captures = new Map<CallableDeclarationNode, Set<SemanticBinding>>()
	private typeAliasDeclarations = new Map<string, TypeAliasDeclarationNode>()
	private resolvingTypeAliases = new Set<string>()
	private functionTypeParameterScopes: string[][] = []
	private model: SemanticModel = {
		identifierBindings: new WeakMap(),
		assignmentTargetBindings: new WeakMap(),
		statementLoopOwners: new WeakMap(),
		declarationBindings: new WeakMap(),
		functionParameterBindings: new WeakMap(),
		forRangeBindings: new WeakMap(),
		returnOwners: new WeakMap(),
		bindingFunctionOwners: new WeakMap(),
		callableCaptures: new WeakMap(),
		methodReceiverBindings: new WeakMap(),
		classFieldTypes: new Map(),
		classFieldVisibilities: new Map(),
		classConstructorParameterTypes: new Map(),
		classBaseNames: new Map(),
		classMethodReturnTypes: new Map(),
		classMethodParameterTypes: new Map(),
		classMethodVisibilities: new Map(),
		classBaseBindings: new WeakMap(),
		classDiscriminantValues: new Map(),
		typeAliases: new Map(),
		classNames: new Set(),
		typeAliasNames: new Set(),
	}

	constructor(
		private readonly reporter: DiagnosticReporter,
		private readonly nodeLocations: NodeLocations,
	) {}

	resolveProgram(program: ProgramNode): {
		program: ProgramNode,
		model: SemanticModel,
	} {
		this.scopes = []
		this.functionOwners = [program]
		this.loopOwners = []
		this.functionLoopSnapshots = []
		this.captures = new Map()
		this.typeAliasDeclarations = new Map()
		this.resolvingTypeAliases = new Set()
		this.functionTypeParameterScopes = []
		this.model = {
			identifierBindings: new WeakMap(),
			assignmentTargetBindings: new WeakMap(),
			statementLoopOwners: new WeakMap(),
			declarationBindings: new WeakMap(),
			functionParameterBindings: new WeakMap(),
			forRangeBindings: new WeakMap(),
			returnOwners: new WeakMap(),
			bindingFunctionOwners: new WeakMap(),
			callableCaptures: new WeakMap(),
			methodReceiverBindings: new WeakMap(),
			classFieldTypes: new Map(),
			classFieldVisibilities: new Map(),
			classConstructorParameterTypes: new Map(),
			classBaseNames: new Map(),
			classMethodReturnTypes: new Map(),
			classMethodParameterTypes: new Map(),
			classMethodVisibilities: new Map(),
			classBaseBindings: new WeakMap(),
			classDiscriminantValues: new Map(),
			typeAliases: new Map(),
			classNames: new Set(),
			typeAliasNames: new Set(),
		}
		this.collectTypeDeclarations(program)
		this.enterScope()
		for (const statement of program.body) {
			this.resolveStatement(statement)
		}
		this.leaveScope()
		for (const [fn, captures] of this.captures.entries()) {
			this.model.callableCaptures.set(fn, [...captures])
		}

		return {
			program,
			model: this.model,
		}
	}

	private resolveStatement(statement: StatementNode): void {
		this.model.statementLoopOwners.set(statement, this.getCurrentLoop())
		switch (statement.type) {
			case 'VariableDeclaration':
				this.declare(statement.name, this.createVariableBinding(statement), statement)
				if (statement.initializer !== null) {
					this.resolveExpression(statement.initializer)
				}
				return
			case 'TypeAliasDeclaration':
				this.resolveTypeAliasDeclaration(statement)
				return
			case 'FunctionDeclaration':
				this.resolveFunctionDeclaration(statement)
				return
			case 'ClassDeclaration':
				this.resolveClassDeclaration(statement)
				return
			case 'IfStatement':
				this.resolveExpression(statement.condition)
				this.resolveConditionBlock(
					statement.thenBranch.statements,
					this.getConditionNarrowings(statement.condition, true),
				)
				if (statement.elseBranch !== null) {
					this.resolveConditionBlock(
						statement.elseBranch.statements,
						this.getConditionNarrowings(statement.condition, false),
					)
				}
				return
			case 'WhileStatement':
				this.resolveExpression(statement.condition)
				this.enterLoop(statement)
				this.resolveBlock(statement.body.statements)
				this.leaveLoop(statement)
				return
			case 'ForRangeStatement':
				this.resolveForRangeStatement(statement)
				return
			case 'ForStatement':
				this.resolveForStatement(statement)
				return
			case 'ReturnStatement':
				this.model.returnOwners.set(statement, this.getCurrentFunction())
				if (statement.value !== null) {
					this.resolveExpression(statement.value)
				}
				return
			case 'BreakStatement':
			case 'ContinueStatement':
				return
			case 'BlockStatement':
				this.resolveBlock(statement.statements)
				return
			case 'ExpressionStatement':
				this.resolveExpression(statement.expression)
				return
			case 'AssignmentStatement':
				if (statement.target.type === 'IdentifierTarget') {
					this.resolveAssignmentTarget(statement.target)
				}
				else if (statement.target.type === 'IndexTarget') {
					this.resolveExpression(statement.target.object)
					this.resolveExpression(statement.target.index)
				}
				else {
					this.resolveExpression(statement.target.object)
				}
				this.resolveExpression(statement.value)
				return
			default:
				throw new Error(`Resolver: неподдерживаемый statement: ${(statement as {type: string}).type}`)
		}
	}

	private resolveFunctionDeclaration(statement: FunctionDeclarationNode): void {
		const binding = this.createFunctionBinding(statement)
		this.declare(statement.name, binding, statement)
		this.resolveCallableDeclaration(statement)
	}

	private resolveTypeAliasDeclaration(statement: TypeAliasDeclarationNode): void {
		this.model.typeAliases.set(statement.name, this.resolveTypeName(statement.typeName, statement))
		const binding: SemanticBinding = {
			kind: 'builtin',
			name: statement.name,
		}
		this.declare(statement.name, binding, statement)
		this.model.declarationBindings.set(statement, binding)
	}

	private collectTypeDeclarations(program: ProgramNode): void {
		for (const statement of program.body) {
			if (statement.type === 'ClassDeclaration') {
				this.model.classNames.add(statement.name)
			}
			else if (statement.type === 'TypeAliasDeclaration') {
				this.model.typeAliasNames.add(statement.name)
				this.typeAliasDeclarations.set(statement.name, statement)
			}
		}
	}

	private resolveClassDeclaration(statement: ClassDeclarationNode): void {
		const binding = this.createClassBinding(statement)
		this.declare(statement.name, binding, statement)
		const baseBinding = statement.baseClassName === null
			? null
			: this.resolveName(statement.baseClassName, statement)
		if (baseBinding !== null && baseBinding.kind !== 'class' && baseBinding.kind !== 'error') {
			throw new Error(`Класс ${statement.name} может наследоваться только от класса: ${statement.baseClassName}`)
		}
		this.model.classBaseBindings.set(statement, baseBinding?.kind === 'class'
			? baseBinding
			: null)
		this.model.classBaseNames.set(
			statement.name,
			baseBinding?.kind === 'class'
				? baseBinding.declaration.name
				: null,
		)
		this.model.classFieldTypes.set(
			statement.name,
			new Map(statement.fields.map(field => [field.name, this.resolveTypeName(field.typeName, field)])),
		)
		this.model.classFieldVisibilities.set(
			statement.name,
			new Map(statement.fields.map(field => [field.name, field.visibility])),
		)
		this.model.classConstructorParameterTypes.set(
			statement.name,
			statement.constructorDeclaration?.params.map(param =>
				this.resolveTypeName(param.typeName, param),
			) ?? [],
		)
		this.model.classMethodReturnTypes.set(
			statement.name,
			new Map(statement.methods.map(method => [
				method.name,
				this.resolveTypeName(method.returnTypeName, method),
			])),
		)
		this.model.classMethodParameterTypes.set(
			statement.name,
			new Map(statement.methods.map(method => [
				method.name,
				method.params.map(param => this.resolveTypeName(param.typeName, param)),
			])),
		)
		this.model.classMethodVisibilities.set(
			statement.name,
			new Map(statement.methods.map(method => [method.name, method.visibility])),
		)
		this.model.classDiscriminantValues.set(
			statement.name,
			this.collectDiscriminantAssignments(statement),
		)
		if (statement.constructorDeclaration !== null) {
			this.resolveConstructorDeclaration(statement.constructorDeclaration, binding, baseBinding)
		}
		for (const method of statement.methods) {
			this.resolveMethodDeclaration(method, binding)
		}
	}

	private resolveConstructorDeclaration(
		statement: ConstructorDeclarationNode,
		receiverBinding: SemanticBinding,
		baseBinding: SemanticBinding | null,
	): void {
		if (receiverBinding.kind !== 'class') {
			throw new Error(`Конструктор должен принадлежать классу`)
		}
		this.model.methodReceiverBindings.set(statement, receiverBinding)
		this.resolveCallableDeclaration(statement, receiverBinding.declaration.name, baseBinding)
	}

	private resolveMethodDeclaration(
		statement: MethodDeclarationNode,
		receiverBinding: SemanticBinding,
	): void {
		if (receiverBinding.kind !== 'class') {
			throw new Error(`Метод ${statement.name} должен принадлежать классу`)
		}
		this.model.methodReceiverBindings.set(statement, receiverBinding)
		const baseBinding = this.model.classBaseBindings.get(receiverBinding.declaration) ?? null
		this.resolveCallableDeclaration(statement, receiverBinding.declaration.name, baseBinding)
	}

	private resolveCallableDeclaration(
		statement: CallableDeclarationNode,
		selfName?: string,
		baseClassBinding?: SemanticBinding | null,
	): void {
		this.captures.set(statement, new Set())
		this.enterFunction(statement)
		if (statement.type === 'FunctionDeclaration') {
			this.functionTypeParameterScopes.push(statement.typeParams)
		}
		this.enterScope()
		const parameterBindings: SemanticBinding[] = []
		if (selfName !== undefined) {
			const selfBinding: SemanticBinding = {
				kind: 'parameter',
				callableDeclaration: statement,
				index: 0,
				name: 'self',
				type: parseSemanticType(selfName),
			}
			this.recordBindingOwner(selfBinding)
			this.declare('self', selfBinding)
			parameterBindings.push(selfBinding)
			if (
				baseClassBinding !== undefined
				&& baseClassBinding !== null
				&& baseClassBinding.kind === 'class'
				&& (statement.type === 'MethodDeclaration' || statement.type === 'ConstructorDeclaration')
			) {
				const superBinding: SemanticBinding = {
					kind: 'super',
					callableDeclaration: statement,
					baseClassBinding,
					selfBinding: selfBinding as Extract<SemanticBinding, {kind: 'parameter'}>,
				}
				this.recordBindingOwner(superBinding)
				this.declare('super', superBinding)
			}
		}
		for (const [index, param] of statement.params.entries()) {
			const parameterBinding: SemanticBinding = {
				kind: 'parameter',
				callableDeclaration: statement,
				index: index + parameterBindings.length,
				name: param.name,
				type: this.resolveTypeName(param.typeName, param),
			}
			this.recordBindingOwner(parameterBinding)
			this.declare(param.name, parameterBinding, statement)
			parameterBindings.push(parameterBinding)
		}
		this.model.functionParameterBindings.set(statement, parameterBindings)
		if (statement.type === 'LambdaExpression') {
			if (statement.body.type === 'BlockStatement') {
				for (const bodyStatement of statement.body.statements) {
					this.resolveStatement(bodyStatement)
				}
			}
			else {
				this.resolveExpression(statement.body)
			}
		}
		else {
			for (const bodyStatement of statement.body.statements) {
				this.resolveStatement(bodyStatement)
			}
		}
		this.leaveScope()
		if (statement.type === 'FunctionDeclaration') {
			this.functionTypeParameterScopes.pop()
		}
		this.leaveFunction(statement)
	}

	private resolveForRangeStatement(statement: ForRangeStatementNode): void {
		this.resolveExpression(statement.start)
		this.resolveExpression(statement.end)
		const binding = this.createIteratorBinding(statement)
		this.enterLoop(statement)
		this.enterScope()
		this.declare(statement.iterator, binding, statement)
		for (const bodyStatement of statement.body.statements) {
			this.resolveStatement(bodyStatement)
		}
		this.leaveScope()
		this.leaveLoop(statement)
	}

	private resolveForStatement(statement: ForStatementNode): void {
		this.resolveExpression(statement.start)
		const binding = this.createIteratorBinding(statement)
		this.enterLoop(statement)
		this.enterScope()
		this.declare(statement.iterator, binding, statement)
		this.resolveExpression(statement.condition)
		if (statement.incrementTarget !== statement.iterator) {
			this.reporter.error(`Итератор for должен обновлять ${statement.iterator}`, this.nodeLocations.get(statement))
		}
		this.resolveExpression(statement.increment)
		for (const bodyStatement of statement.body.statements) {
			this.resolveStatement(bodyStatement)
		}
		this.leaveScope()
		this.leaveLoop(statement)
	}

	private resolveExpression(expression: ExpressionNode): void {
		switch (expression.type) {
			case 'LiteralExpression':
				return
			case 'IdentifierExpression':
				this.resolveIdentifierExpression(expression)
				return
			case 'UnaryExpression':
				this.resolveExpression(expression.argument)
				return
			case 'BinaryExpression':
				this.resolveExpression(expression.left)
				this.resolveExpression(expression.right)
				return
			case 'ArrayExpression':
				for (const element of expression.elements) {
					this.resolveExpression(element)
				}
				return
			case 'ObjectExpression':
				for (const property of expression.properties) {
					this.resolveExpression(property.value)
				}
				return
			case 'ChooseExpression':
			case 'CollectExpression':
				for (const branch of expression.branches) {
					this.resolveExpression(branch.condition)
					this.resolveExpression(branch.value)
				}
				if (expression.type === 'ChooseExpression') {
					this.resolveExpression(expression.defaultValue)
				}
				return
			case 'MatchExpression':
				this.resolveExpression(expression.subject)
				for (const branch of expression.branches) {
					this.resolveExpression(branch.pattern)
					this.resolveExpression(branch.value)
				}
				if (expression.defaultValue !== null) {
					this.resolveExpression(expression.defaultValue)
				}
				return
			case 'MatchByExpression':
				this.resolveExpression(expression.subject)
				for (const branch of expression.branches) {
					this.resolveMatchByBranchValue(expression, branch.pattern.value, branch.value)
				}
				if (expression.defaultValue !== null) {
					this.resolveExpression(expression.defaultValue)
				}
				return
			case 'IndexExpression':
			case 'OptionalIndexExpression':
			case 'MemberExpression':
			case 'OptionalMemberExpression':
				this.resolveExpression(expression.object)
				if ('index' in expression) {
					this.resolveExpression(expression.index)
				}
				return
			case 'CallExpression':
				this.resolveExpression(expression.callee)
				for (const arg of expression.args) {
					this.resolveExpression(arg)
				}
				return
			case 'LambdaExpression':
				this.resolveLambdaExpression(expression)
				return
			default:
				throw new Error(`Resolver: неподдерживаемое выражение: ${(expression as {type: string}).type}`)
		}
	}

	private resolveLambdaExpression(expression: LambdaExpressionNode): void {
		this.captures.set(expression, new Set())
		this.enterFunction(expression)
		this.enterScope()
		const parameterBindings: SemanticBinding[] = []
		for (const [index, param] of expression.params.entries()) {
			const parameterBinding: SemanticBinding = {
				kind: 'parameter',
				callableDeclaration: expression,
				index,
				name: param.name,
				type: this.resolveTypeName(param.typeName, param),
			}
			this.recordBindingOwner(parameterBinding)
			this.declare(param.name, parameterBinding, expression)
			parameterBindings.push(parameterBinding)
		}
		this.model.functionParameterBindings.set(expression, parameterBindings)
		if (expression.body.type === 'BlockStatement') {
			for (const bodyStatement of expression.body.statements) {
				this.resolveStatement(bodyStatement)
			}
		}
		else {
			this.resolveExpression(expression.body)
		}
		this.leaveScope()
		this.leaveFunction(expression)
	}

	private resolveMatchByBranchValue(
		expression: Extract<ExpressionNode, {type: 'MatchByExpression'}>,
		patternValue: string | number | boolean | null,
		branchValue: ExpressionNode,
	): void {
		if (expression.subject.type !== 'IdentifierExpression') {
			this.resolveExpression(branchValue)
			return
		}
		const originalBinding = this.model.identifierBindings.get(expression.subject)
		if (originalBinding === undefined) {
			this.resolveExpression(branchValue)
			return
		}
		const narrowedType = this.inferMatchByNarrowedType(originalBinding, expression.discriminant, patternValue)
		if (narrowedType === null) {
			this.resolveExpression(branchValue)
			return
		}

		this.enterScope()
		this.declare(expression.subject.name, {
			kind: 'narrowed',
			original: originalBinding,
			name: expression.subject.name,
			type: narrowedType,
		}, expression)
		this.resolveExpression(branchValue)
		this.leaveScope()
	}

	private resolveBlock(statements: StatementNode[]): void {
		this.enterScope()
		for (const statement of statements) {
			this.resolveStatement(statement)
		}
		this.leaveScope()
	}

	private resolveConditionBlock(statements: StatementNode[], narrowings: ConditionNarrowing[]): void {
		this.enterScope()
		for (const narrowing of this.mergeConditionNarrowings(narrowings)) {
			this.applyConditionNarrowing(narrowing)
		}
		for (const statement of statements) {
			this.resolveStatement(statement)
		}
		this.leaveScope()
	}

	private mergeConditionNarrowings(narrowings: ConditionNarrowing[]): ConditionNarrowing[] {
		const byName = new Map<string, ConditionNarrowing>()
		for (const narrowing of narrowings) {
			byName.set(narrowing.name, narrowing)
		}
		return [...byName.values()]
	}

	private applyConditionNarrowing(narrowing: ConditionNarrowing): void {
		this.declare(narrowing.name, {
			kind: 'narrowed',
			original: narrowing.binding,
			name: narrowing.name,
			type: narrowing.type,
		})
	}

	private getConditionNarrowings(condition: ExpressionNode, truthyBranch: boolean): ConditionNarrowing[] {
		if (condition.type === 'BinaryExpression') {
			if (condition.operator === '&&' && truthyBranch) {
				return this.getSequentialConditionNarrowings(condition.left, condition.right, true)
			}
			if (condition.operator === '||' && !truthyBranch) {
				return this.getSequentialConditionNarrowings(condition.left, condition.right, false)
			}
		}
		const narrowing = this.getAtomicConditionNarrowing(condition, truthyBranch)
		return narrowing === null
			? []
			: [narrowing]
	}

	private getSequentialConditionNarrowings(
		left: ExpressionNode,
		right: ExpressionNode,
		truthyBranch: boolean,
	): ConditionNarrowing[] {
		const leftNarrowings = this.getConditionNarrowings(left, truthyBranch)
		this.enterScope()
		for (const narrowing of leftNarrowings) {
			this.applyConditionNarrowing(narrowing)
		}
		const rightNarrowings = this.getConditionNarrowings(right, truthyBranch)
		this.leaveScope()
		return [...leftNarrowings, ...rightNarrowings]
	}

	private getAtomicConditionNarrowing(condition: ExpressionNode, truthyBranch: boolean): ConditionNarrowing | null {
		return this.getNullCheckNarrowing(condition, truthyBranch)
			?? this.getDiscriminantCheckNarrowing(condition, truthyBranch)
	}

	private getNullCheckNarrowing(condition: ExpressionNode, truthyBranch: boolean): ConditionNarrowing | null {
		if (condition.type !== 'BinaryExpression') {
			return null
		}
		if (condition.operator !== '!=' && condition.operator !== '==') {
			return null
		}
		const identifier = this.getNullCheckIdentifier(condition.left, condition.right)
		if (identifier === null) {
			return null
		}
		const narrowsWhenTruthy = condition.operator === '!='
		if (truthyBranch !== narrowsWhenTruthy) {
			return null
		}
		const binding = this.model.identifierBindings.get(identifier)
		if (binding === undefined) {
			return null
		}
		const narrowedType = removeNullFromType(this.getBindingDeclaredType(binding))
		return {
			name: identifier.name,
			binding,
			type: narrowedType,
		}
	}

	private getNullCheckIdentifier(
		left: ExpressionNode,
		right: ExpressionNode,
	): IdentifierExpressionNode | null {
		if (left.type === 'IdentifierExpression' && this.isNullLiteral(right)) {
			return left
		}
		if (right.type === 'IdentifierExpression' && this.isNullLiteral(left)) {
			return right
		}
		return null
	}

	private getDiscriminantCheckNarrowing(condition: ExpressionNode, truthyBranch: boolean): ConditionNarrowing | null {
		if (condition.type !== 'BinaryExpression') {
			return null
		}
		if (condition.operator !== '==' && condition.operator !== '!=') {
			return null
		}
		const check = this.getDiscriminantCheck(condition.left, condition.right)
			?? this.getDiscriminantCheck(condition.right, condition.left)
		if (check === null) {
			return null
		}
		const binding = this.model.identifierBindings.get(check.subject)
		if (binding === undefined) {
			return null
		}
		const narrowsToMatchingClasses = condition.operator === '=='
			? truthyBranch
			: !truthyBranch
		const narrowedType = this.inferDiscriminantNarrowedType(
			binding,
			check.discriminant,
			check.value,
			narrowsToMatchingClasses,
		)
		if (narrowedType === null) {
			return null
		}
		return {
			name: check.subject.name,
			binding,
			type: narrowedType,
		}
	}

	private getDiscriminantCheck(
		member: ExpressionNode,
		value: ExpressionNode,
	): {
		subject: IdentifierExpressionNode,
		discriminant: string,
		value: string | number | boolean | null,
	} | null {
		if (member.type !== 'MemberExpression' || member.object.type !== 'IdentifierExpression') {
			return null
		}
		if (value.type !== 'LiteralExpression') {
			return null
		}
		return {
			subject: member.object,
			discriminant: member.property,
			value: value.value,
		}
	}

	private isNullLiteral(expression: ExpressionNode): boolean {
		return expression.type === 'LiteralExpression' && expression.value === null
	}

	private resolveIdentifierExpression(expression: IdentifierExpressionNode): void {
		const binding = this.resolveName(expression.name, expression)
		this.model.identifierBindings.set(expression, binding)
		this.recordCapture(binding)
	}

	private resolveAssignmentTarget(target: IdentifierTargetNode): void {
		const binding = this.resolveName(target.name, target)
		this.model.assignmentTargetBindings.set(target, binding)
		this.recordCapture(binding)
	}

	private createVariableBinding(statement: VariableDeclarationNode): SemanticBinding {
		const binding: SemanticBinding = {
			kind: 'variable',
			declaration: statement,
		}
		this.model.declarationBindings.set(statement, binding)
		this.recordBindingOwner(binding)

		return binding
	}

	private createFunctionBinding(statement: FunctionDeclarationNode): SemanticBinding {
		const binding: SemanticBinding = {
			kind: 'function',
			declaration: statement,
		}
		this.model.declarationBindings.set(statement, binding)
		this.recordBindingOwner(binding)

		return binding
	}

	private createClassBinding(statement: ClassDeclarationNode): SemanticBinding {
		const binding: SemanticBinding = {
			kind: 'class',
			declaration: statement,
		}
		this.model.declarationBindings.set(statement, binding)
		this.recordBindingOwner(binding)

		return binding
	}

	private createIteratorBinding(statement: ForRangeStatementNode | ForStatementNode): SemanticBinding {
		const binding: SemanticBinding = {
			kind: 'iterator',
			statement,
			name: statement.iterator,
		}
		this.model.forRangeBindings.set(statement, binding)
		this.recordBindingOwner(binding)

		return binding
	}

	private inferMatchByNarrowedType(
		binding: SemanticBinding,
		discriminant: string,
		patternValue: string | number | boolean | null,
	): ReturnType<typeof parseSemanticType> | null {
		return this.inferDiscriminantNarrowedType(binding, discriminant, patternValue, true)
	}

	private inferDiscriminantNarrowedType(
		binding: SemanticBinding,
		discriminant: string,
		patternValue: string | number | boolean | null,
		includeMatchingClasses: boolean,
	): ReturnType<typeof parseSemanticType> | null {
		const bindingType = this.getBindingDeclaredType(binding)
		const matchingClasses = this.getMatchByCandidateClassNames(bindingType)
			.filter(className =>
				(this.getDiscriminantValue(className, discriminant) === patternValue) === includeMatchingClasses,
			)

		if (matchingClasses.length === 0) {
			return null
		}

		return unionType(matchingClasses.map(className => this.resolveTypeName(className)))
	}

	private getMatchByCandidateClassNames(type: ReturnType<typeof parseSemanticType>): string[] {
		if (type.kind === 'class') {
			return [...this.model.classFieldTypes.keys()].filter(className =>
				this.isSubclassOrSame(className, type.name),
			)
		}
		if (type.kind === 'union') {
			return type.types
				.filter((item): item is Extract<ReturnType<typeof parseSemanticType>, {kind: 'class'}> =>
					item.kind === 'class')
				.map(item => item.name)
		}
		return []
	}

	private getBindingDeclaredType(binding: SemanticBinding): ReturnType<typeof parseSemanticType> {
		switch (binding.kind) {
			case 'variable':
				return this.resolveTypeName(binding.declaration.typeName)
			case 'parameter':
				return binding.type
			case 'class':
				return this.resolveTypeName(binding.declaration.name)
			case 'narrowed':
				return binding.type
			default:
				return parseSemanticType('any')
		}
	}

	private resolveTypeName(typeName: TypeName, node?: DiagnosticNode): ReturnType<typeof parseSemanticType> {
		try {
			return parseSemanticType(
				typeNameToString(typeName),
				name => this.isCurrentFunctionTypeParameter(name)
					? typeParameterType(name)
					: this.model.typeAliasNames.has(name)
						? this.resolveTypeAliasByName(name)
						: null,
				name => this.isKnownTypeName(name),
			)
		}
		catch (error) {
			this.reporter.reportError(error, getTypeErrorLocation(typeName, node, this.nodeLocations, error))
			return errorType()
		}
	}

	private isKnownTypeName(name: string): boolean {
		if (this.isCurrentFunctionTypeParameter(name)) {
			return true
		}
		if (this.model.classNames.has(name)) {
			return true
		}
		if (!this.model.typeAliasNames.has(name)) {
			return false
		}
		this.resolveTypeAliasByName(name)
		return true
	}

	private isCurrentFunctionTypeParameter(name: string): boolean {
		return this.functionTypeParameterScopes.some(scope => scope.includes(name))
	}

	private resolveTypeAliasByName(name: string): ReturnType<typeof parseSemanticType> {
		const cached = this.model.typeAliases.get(name)
		if (cached !== undefined) {
			return cached
		}
		const declaration = this.typeAliasDeclarations.get(name)
		if (declaration === undefined) {
			throw new Error(`Неизвестный тип: ${name}`)
		}
		if (this.resolvingTypeAliases.has(name)) {
			throw new Error(`Циклический type alias: ${name}`)
		}
		this.resolvingTypeAliases.add(name)
		let resolved: ReturnType<typeof parseSemanticType>
		try {
			resolved = this.resolveTypeName(declaration.typeName, declaration)
		}
		finally {
			this.resolvingTypeAliases.delete(name)
		}
		this.model.typeAliases.set(name, resolved)
		return resolved
	}

	private getDiscriminantValue(
		className: string,
		discriminant: string,
	): string | number | boolean | null | undefined {
		const ownValue = this.model.classDiscriminantValues.get(className)?.get(discriminant)
		if (ownValue !== undefined) {
			return ownValue
		}
		const baseName = this.model.classBaseNames.get(className) ?? null
		return baseName === null
			? undefined
			: this.getDiscriminantValue(baseName, discriminant)
	}

	private isSubclassOrSame(className: string, targetBaseName: string): boolean {
		if (className === targetBaseName) {
			return true
		}
		let current = this.model.classBaseNames.get(className) ?? null
		while (current !== null) {
			if (current === targetBaseName) {
				return true
			}
			current = this.model.classBaseNames.get(current) ?? null
		}
		return false
	}

	private collectDiscriminantAssignments(
		statement: ClassDeclarationNode,
	): Map<string, string | number | boolean | null> {
		const assignments = new Map<string, string | number | boolean | null>()
		const constructorDeclaration = statement.constructorDeclaration
		if (constructorDeclaration === null) {
			return assignments
		}
		for (const bodyStatement of constructorDeclaration.body.statements) {
			if (bodyStatement.type !== 'AssignmentStatement') {
				continue
			}
			if (bodyStatement.target.type !== 'MemberTarget') {
				continue
			}
			if (
				bodyStatement.target.object.type !== 'IdentifierExpression'
				|| bodyStatement.target.object.name !== 'self'
			) {
				continue
			}
			if (bodyStatement.value.type !== 'LiteralExpression') {
				continue
			}
			assignments.set(bodyStatement.target.property, bodyStatement.value.value)
		}
		return assignments
	}

	private recordBindingOwner(binding: OwnedSemanticBinding): void {
		this.model.bindingFunctionOwners.set(binding, this.getCurrentFunctionOwner())
	}

	private recordCapture(binding: SemanticBinding): void {
		if (binding.kind === 'builtin' || binding.kind === 'error') {
			return
		}
		const currentFunction = this.getCurrentFunction()
		if (currentFunction === null) {
			return
		}
		const bindingOwner = this.model.bindingFunctionOwners.get(binding)
		if (bindingOwner === undefined || bindingOwner === currentFunction) {
			return
		}
		const captures = this.captures.get(currentFunction)
		if (captures === undefined) {
			throw new Error('Resolver: capture set not initialized for function')
		}
		captures.add(binding)
	}

	private resolveName(name: string, node?: DiagnosticNode): SemanticBinding {
		if (isBuiltinGlobalName(name)) {
			return {
				kind: 'builtin',
				name,
			}
		}
		for (let i = this.scopes.length - 1; i >= 0; i--) {
			const binding = this.scopes[i].bindings.get(name)
			if (binding !== undefined) {
				return binding
			}
		}
		this.reporter.error(`Неизвестная переменная: ${name}`, this.getNodeLocation(node))
		return errorBinding(name)
	}

	private getNodeLocation(node: DiagnosticNode | undefined): SourceLocation | null {
		return node === undefined
			? null
			: this.nodeLocations.get(node)
	}

	private declare(name: string, binding: SemanticBinding, node?: DiagnosticNode): void {
		const currentScope = this.scopes[this.scopes.length - 1]
		if (currentScope === undefined) {
			throw new Error('Resolver: отсутствует текущий scope')
		}
		if (currentScope.bindings.has(name)) {
			this.reporter.error(`Повторное объявление переменной: ${name}`, this.getNodeLocation(node))
			return
		}
		currentScope.bindings.set(name, binding)
	}

	private enterFunction(statement: CallableDeclarationNode): void {
		this.functionLoopSnapshots.push([...this.loopOwners])
		this.loopOwners = []
		this.functionOwners.push(statement)
	}

	private leaveFunction(statement: CallableDeclarationNode): void {
		const owner = this.functionOwners.pop()
		if (owner !== statement) {
			throw new Error('Resolver: неожиданный выход из функции')
		}
		const loopSnapshot = this.functionLoopSnapshots.pop()
		if (loopSnapshot === undefined) {
			throw new Error('Resolver: отсутствует snapshot loop-контекста функции')
		}
		this.loopOwners = loopSnapshot
	}

	private getCurrentFunction(): CallableDeclarationNode | null {
		const owner = this.getCurrentFunctionOwner()

		return owner.type === 'Program'
			? null
			: owner
	}

	private getCurrentFunctionOwner(): SemanticFunctionOwner {
		const owner = this.functionOwners[this.functionOwners.length - 1]
		if (owner === undefined) {
			throw new Error('Resolver: отсутствует текущий function owner')
		}

		return owner
	}

	private enterLoop(statement: SemanticLoopOwner): void {
		this.loopOwners.push(statement)
	}

	private leaveLoop(statement: SemanticLoopOwner): void {
		const owner = this.loopOwners.pop()
		if (owner !== statement) {
			throw new Error('Resolver: неожиданный выход из loop-контекста')
		}
	}

	private getCurrentLoop(): SemanticLoopOwner | null {
		const currentLoop = this.loopOwners[this.loopOwners.length - 1]

		return currentLoop ?? null
	}

	private enterScope(): void {
		this.scopes.push({bindings: new Map()})
	}

	private leaveScope(): void {
		const scope = this.scopes.pop()
		if (scope === undefined) {
			throw new Error('Resolver: неожиданный выход из scope')
		}
	}
}

export {
	Resolver,
}
