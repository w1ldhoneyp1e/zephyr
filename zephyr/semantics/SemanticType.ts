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

type SemanticType =
	| AnySemanticType
	| PrimitiveSemanticType
	| ClassSemanticType
	| ArraySemanticType
	| FunctionSemanticType
	| UnionSemanticType

const ANY_TYPE: SemanticType = {kind: 'any'}

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

function formatSemanticType(type: SemanticType): string {
	switch (type.kind) {
		case 'any':
			return 'any'
		case 'primitive':
			return type.name
		case 'class':
			return type.name
		case 'array':
			return `${formatAtomicSemanticType(type.elementType)}[]`
		case 'function':
			return `(${type.paramTypes.map(formatSemanticType).join(', ')}) => ${formatSemanticType(type.returnType)}`
		case 'union':
			return type.types.map(formatSemanticType).join(' | ')
	}
}

function formatAtomicSemanticType(type: SemanticType): string {
	return type.kind === 'function' || type.kind === 'union'
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
	}
}

function parseSemanticType(typeName: string): SemanticType {
	const normalized = typeName.trim()
	if (normalized === '' || normalized === 'any') {
		return anyType()
	}

	let current = normalized
	const arrowIndex = findTopLevelArrow(current)
	if (arrowIndex !== -1) {
		const paramsEnd = current.lastIndexOf(')', arrowIndex)
		const paramsSource = current.slice(1, paramsEnd).trim()
		const returnSource = current.slice(arrowIndex + 2).trim()
		const paramTypes = paramsSource === ''
			? []
			: splitTopLevel(paramsSource, ',').map(part => parseSemanticType(part))
		return functionType(paramTypes, parseSemanticType(returnSource))
	}

	const unionParts = splitTopLevel(current, '|')
	if (unionParts.length > 1) {
		return unionType(unionParts.map(part => parseSemanticType(part)))
	}

	let arrayDepth = 0
	while (current.endsWith('[]')) {
		arrayDepth++
		current = current.slice(0, -2).trim()
	}

	let baseType: SemanticType
	if (isWrappedInParens(current)) {
		baseType = parseSemanticType(current.slice(1, -1))
	}
	else if (current === 'number' || current === 'string' || current === 'boolean' || current === 'null') {
		baseType = primitiveType(current)
	}
	else {
		baseType = classType(current)
	}

	for (let depth = 0; depth < arrayDepth; depth++) {
		baseType = arrayType(baseType)
	}

	return baseType
}

function isWrappedInParens(source: string): boolean {
	if (!source.startsWith('(') || !source.endsWith(')')) {
		return false
	}
	let depth = 0
	for (let index = 0; index < source.length; index++) {
		const char = source[index]
		if (char === '(') {
			depth++
		}
		else if (char === ')') {
			depth--
			if (depth === 0 && index !== source.length - 1) {
				return false
			}
		}
	}
	return depth === 0
}

function findTopLevelArrow(source: string): number {
	let depth = 0
	for (let index = 0; index < source.length - 1; index++) {
		const char = source[index]
		if (char === '(') {
			depth++
		}
		else if (char === ')') {
			depth--
		}
		else if (char === '=' && source[index + 1] === '>' && depth === 0) {
			return index
		}
	}
	return -1
}

function splitTopLevel(source: string, delimiter: string): string[] {
	const parts: string[] = []
	let depth = 0
	let start = 0
	for (let index = 0; index < source.length; index++) {
		const char = source[index]
		if (char === '(') {
			depth++
		}
		else if (char === ')') {
			depth--
		}
		else if (char === delimiter && depth === 0) {
			parts.push(source.slice(start, index).trim())
			start = index + 1
		}
	}
	parts.push(source.slice(start).trim())
	return parts.filter(Boolean)
}

export {
	ANY_TYPE,
	anyType,
	arrayType,
	classType,
	formatSemanticType,
	functionType,
	parseSemanticType,
	primitiveType,
	type SemanticType,
	semanticTypesEqual,
	unionType,
}
