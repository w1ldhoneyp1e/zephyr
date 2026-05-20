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

type SemanticType =
	| AnySemanticType
	| PrimitiveSemanticType
	| ClassSemanticType
	| ArraySemanticType
	| FunctionSemanticType

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
	}
}

function formatAtomicSemanticType(type: SemanticType): string {
	return type.kind === 'function'
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
	}
}

function parseSemanticType(typeName: string): SemanticType {
	const normalized = typeName.trim()
	if (normalized === '' || normalized === 'any') {
		return anyType()
	}

	let current = normalized
	let arrayDepth = 0
	while (current.endsWith('[]')) {
		arrayDepth++
		current = current.slice(0, -2).trim()
	}

	let baseType: SemanticType
	const arrowIndex = findTopLevelArrow(current)
	if (current.startsWith('(') && current.endsWith(')') && arrowIndex === -1) {
		baseType = parseSemanticType(current.slice(1, -1))
	}
	else if (arrowIndex !== -1) {
		const paramsEnd = current.lastIndexOf(')', arrowIndex)
		const paramsSource = current.slice(1, paramsEnd).trim()
		const returnSource = current.slice(arrowIndex + 2).trim()
		const paramTypes = paramsSource === ''
			? []
			: splitTopLevel(paramsSource).map(part => parseSemanticType(part))
		baseType = functionType(paramTypes, parseSemanticType(returnSource))
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

function splitTopLevel(source: string): string[] {
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
		else if (char === ',' && depth === 0) {
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
}
