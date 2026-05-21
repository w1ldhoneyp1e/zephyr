type PrimitiveTypeName = 'number' | 'string' | 'boolean' | 'null'

interface AnySemanticType {
	kind: 'any',
}

interface PrimitiveSemanticType {
	kind: 'primitive',
	name: PrimitiveTypeName,
}

interface ClassSemanticType {
	kind: 'class',
	name: string,
}

interface TypeParameterSemanticType {
	kind: 'typeParameter',
	name: string,
}

interface ArraySemanticType {
	kind: 'array',
	elementType: SemanticType,
}

interface FunctionSemanticType {
	kind: 'function',
	paramTypes: SemanticType[],
	returnType: SemanticType,
}

interface UnionSemanticType {
	kind: 'union',
	types: SemanticType[],
}

interface ObjectSemanticType {
	kind: 'object',
	properties: Map<string, SemanticType>,
}

type SemanticType =
	| AnySemanticType
	| PrimitiveSemanticType
	| ClassSemanticType
	| TypeParameterSemanticType
	| ArraySemanticType
	| FunctionSemanticType
	| UnionSemanticType
	| ObjectSemanticType

const ANY_TYPE: SemanticType = {kind: 'any'}
type TypeAliasResolver = (name: string) => SemanticType | null
type TypeNameValidator = (name: string) => boolean

function anyType(): SemanticType {
	return ANY_TYPE
}

function primitiveType(name: PrimitiveTypeName): SemanticType {
	return {
		kind: 'primitive',
		name,
	}
}

function classType(name: string): SemanticType {
	return {
		kind: 'class',
		name,
	}
}

function typeParameterType(name: string): SemanticType {
	return {
		kind: 'typeParameter',
		name,
	}
}

function arrayType(elementType: SemanticType): SemanticType {
	return {
		kind: 'array',
		elementType,
	}
}

function functionType(paramTypes: SemanticType[], returnType: SemanticType): SemanticType {
	return {
		kind: 'function',
		paramTypes,
		returnType,
	}
}

function objectType(properties: Map<string, SemanticType>): SemanticType {
	return {
		kind: 'object',
		properties,
	}
}

function unionType(types: SemanticType[]): SemanticType {
	const flattened: SemanticType[] = []
	for (const type of types) {
		if (type.kind === 'union') {
			flattened.push(...type.types)
		}
		else {
			flattened.push(type)
		}
	}
	const uniqueTypes: SemanticType[] = []
	for (const type of flattened) {
		if (!uniqueTypes.some(existing => semanticTypesEqual(existing, type))) {
			uniqueTypes.push(type)
		}
	}

	return uniqueTypes.length === 1
		? uniqueTypes[0]
		: {
			kind: 'union',
			types: uniqueTypes,
		}
}

function removeNullFromType(type: SemanticType): SemanticType {
	if (type.kind !== 'union') {
		return type
	}
	return unionType(type.types.filter(item =>
		!(item.kind === 'primitive' && item.name === 'null'),
	))
}

function hasNullType(type: SemanticType): boolean {
	return (type.kind === 'primitive' && type.name === 'null')
		|| (type.kind === 'union' && type.types.some(hasNullType))
}

function formatSemanticType(type: SemanticType): string {
	switch (type.kind) {
		case 'any':
			return 'any'
		case 'primitive':
			return type.name
		case 'class':
			return type.name
		case 'typeParameter':
			return type.name
		case 'array':
			return `${formatAtomicSemanticType(type.elementType)}[]`
		case 'function':
			return `(${type.paramTypes.map(formatSemanticType).join(', ')}) => ${formatSemanticType(type.returnType)}`
		case 'union':
			return type.types.map(formatSemanticType).join(' | ')
		case 'object':
			return `{ ${[...type.properties.entries()]
				.map(([name, propertyType]) => `${name}: ${formatSemanticType(propertyType)}`)
				.join('; ')} }`
	}
}

function formatAtomicSemanticType(type: SemanticType): string {
	return type.kind === 'function' || type.kind === 'union' || type.kind === 'object'
		? `(${formatSemanticType(type)})`
		: formatSemanticType(type)
}

function semanticTypesEqual(left: SemanticType, right: SemanticType): boolean {
	if (left.kind !== right.kind) {
		return false
	}

	switch (left.kind) {
		case 'any':
			return true
		case 'primitive':
			return left.name === (right as PrimitiveSemanticType).name
		case 'class':
			return left.name === (right as ClassSemanticType).name
		case 'typeParameter':
			return left.name === (right as TypeParameterSemanticType).name
		case 'array':
			return semanticTypesEqual(left.elementType, (right as ArraySemanticType).elementType)
		case 'function': {
			const rightFunction = right as FunctionSemanticType
			if (left.paramTypes.length !== rightFunction.paramTypes.length) {
				return false
			}
			for (const [index, paramType] of left.paramTypes.entries()) {
				if (!semanticTypesEqual(paramType, rightFunction.paramTypes[index])) {
					return false
				}
			}
			return semanticTypesEqual(left.returnType, rightFunction.returnType)
		}
		case 'union': {
			const rightUnion = right as UnionSemanticType
			return left.types.length === rightUnion.types.length
				&& left.types.every(leftType =>
					rightUnion.types.some(rightType => semanticTypesEqual(leftType, rightType)),
				)
		}
		case 'object': {
			const rightObject = right as ObjectSemanticType
			return left.properties.size === rightObject.properties.size
				&& [...left.properties.entries()].every(([name, type]) => {
					const rightType = rightObject.properties.get(name)
					return rightType !== undefined && semanticTypesEqual(type, rightType)
				})
		}
	}
}

function resolveSemanticType(
	typeName: string,
	aliases: Map<string, SemanticType>,
	isKnownTypeName?: TypeNameValidator,
): SemanticType {
	return parseSemanticType(typeName, name => aliases.get(name) ?? null, isKnownTypeName)
}

function parseSemanticType(
	typeName: string,
	resolveAlias?: TypeAliasResolver,
	isKnownTypeName?: TypeNameValidator,
): SemanticType {
	const normalized = typeName.trim()
	if (normalized === '' || normalized === 'any') {
		return anyType()
	}

	let current = normalized
	if (isObjectTypeSource(current)) {
		return parseObjectSemanticType(current, resolveAlias, isKnownTypeName)
	}

	const arrowIndex = findTopLevelArrow(current)
	if (arrowIndex !== -1) {
		const paramsEnd = current.lastIndexOf(')', arrowIndex)
		const paramsSource = current.slice(1, paramsEnd).trim()
		const returnSource = current.slice(arrowIndex + 2).trim()
		const paramTypes = paramsSource === ''
			? []
			: splitTopLevel(paramsSource, ',').map(part => parseSemanticType(part, resolveAlias, isKnownTypeName))
		return functionType(paramTypes, parseSemanticType(returnSource, resolveAlias, isKnownTypeName))
	}

	const unionParts = splitTopLevel(current, '|')
	if (unionParts.length > 1) {
		return unionType(unionParts.map(part => parseSemanticType(part, resolveAlias, isKnownTypeName)))
	}

	let arrayDepth = 0
	while (current.endsWith('[]')) {
		arrayDepth++
		current = current.slice(0, -2).trim()
	}

	let baseType: SemanticType
	if (isWrappedInParens(current)) {
		baseType = parseSemanticType(current.slice(1, -1), resolveAlias, isKnownTypeName)
	}
	else if (current === 'number' || current === 'string' || current === 'boolean' || current === 'null') {
		baseType = primitiveType(current)
	}
	else if (resolveAlias !== undefined) {
		baseType = resolveAlias(current) ?? createNamedType(current, isKnownTypeName)
	}
	else {
		baseType = createNamedType(current, isKnownTypeName)
	}

	for (let depth = 0; depth < arrayDepth; depth++) {
		baseType = arrayType(baseType)
	}

	return baseType
}

function isObjectTypeSource(source: string): boolean {
	return source.startsWith('{') && source.endsWith('}') && isWrapped(source, '{', '}')
}

function parseObjectSemanticType(
	source: string,
	resolveAlias?: TypeAliasResolver,
	isKnownTypeName?: TypeNameValidator,
): SemanticType {
	const properties = new Map<string, SemanticType>()
	const body = source.slice(1, -1).trim()
	if (body === '') {
		return objectType(properties)
	}
	for (const member of splitTopLevel(body, ';')) {
		const colonIndex = findTopLevelDelimiter(member, ':')
		if (colonIndex === -1) {
			throw new Error(`Некорректное поле object type: ${member}`)
		}
		const name = member.slice(0, colonIndex).trim()
		const typeSource = member.slice(colonIndex + 1).trim()
		properties.set(name, parseSemanticType(typeSource, resolveAlias, isKnownTypeName))
	}
	return objectType(properties)
}

function createNamedType(name: string, isKnownTypeName?: TypeNameValidator): SemanticType {
	if (isKnownTypeName !== undefined && !isKnownTypeName(name)) {
		throw new Error(`Неизвестный тип: ${name}`)
	}
	return classType(name)
}

function isWrappedInParens(source: string): boolean {
	return isWrapped(source, '(', ')')
}

function isWrapped(source: string, open: string, close: string): boolean {
	if (!source.startsWith(open) || !source.endsWith(close)) {
		return false
	}
	let depth = 0
	for (let index = 0; index < source.length; index++) {
		const char = source[index]
		if (char === open) {
			depth++
		}
		else if (char === close) {
			depth--
			if (depth === 0 && index !== source.length - 1) {
				return false
			}
		}
	}
	return depth === 0
}

function findTopLevelArrow(source: string): number {
	let parenDepth = 0
	let braceDepth = 0
	for (let index = 0; index < source.length - 1; index++) {
		const char = source[index]
		if (char === '(') {
			parenDepth++
		}
		else if (char === ')') {
			parenDepth--
		}
		else if (char === '{') {
			braceDepth++
		}
		else if (char === '}') {
			braceDepth--
		}
		else if (char === '=' && source[index + 1] === '>' && parenDepth === 0 && braceDepth === 0) {
			return index
		}
	}
	return -1
}

function splitTopLevel(source: string, delimiter: string): string[] {
	const parts: string[] = []
	let parenDepth = 0
	let braceDepth = 0
	let start = 0
	for (let index = 0; index < source.length; index++) {
		const char = source[index]
		if (char === '(') {
			parenDepth++
		}
		else if (char === ')') {
			parenDepth--
		}
		else if (char === '{') {
			braceDepth++
		}
		else if (char === '}') {
			braceDepth--
		}
		else if (char === delimiter && parenDepth === 0 && braceDepth === 0) {
			parts.push(source.slice(start, index).trim())
			start = index + 1
		}
	}
	parts.push(source.slice(start).trim())
	return parts.filter(Boolean)
}

function findTopLevelDelimiter(source: string, delimiter: string): number {
	return splitTopLevelWithPositions(source, delimiter)[0]?.delimiterIndex ?? -1
}

function splitTopLevelWithPositions(source: string, delimiter: string): {
	delimiterIndex: number,
}[] {
	let parenDepth = 0
	let braceDepth = 0
	for (let index = 0; index < source.length; index++) {
		const char = source[index]
		if (char === '(') {
			parenDepth++
		}
		else if (char === ')') {
			parenDepth--
		}
		else if (char === '{') {
			braceDepth++
		}
		else if (char === '}') {
			braceDepth--
		}
		else if (char === delimiter && parenDepth === 0 && braceDepth === 0) {
			return [{delimiterIndex: index}]
		}
	}
	return []
}

export {
	ANY_TYPE,
	anyType,
	arrayType,
	classType,
	formatSemanticType,
	functionType,
	hasNullType,
	objectType,
	parseSemanticType,
	primitiveType,
	removeNullFromType,
	resolveSemanticType,
	type SemanticType,
	semanticTypesEqual,
	typeParameterType,
	unionType,
}
