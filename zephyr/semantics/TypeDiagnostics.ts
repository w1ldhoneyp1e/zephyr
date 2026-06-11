import {type TypeName, typeNameToString} from '../ast'
import {type NodeLocations, type SourceLocation} from '../diagnostics'

function getTypeErrorLocation(
	typeName: TypeName,
	fallbackNode: object | undefined,
	nodeLocations: NodeLocations,
	error: unknown,
): SourceLocation | null {
	const message = error instanceof Error
		? error.message
		: String(error)
	if (typeof typeName !== 'string' && typeName.objectMembers !== undefined) {
		for (const member of typeName.objectMembers) {
			if (message.includes(typeNameToString(member.typeName))) {
				return nodeLocations.get(member)
			}
		}
	}

	return fallbackNode === undefined
		? null
		: nodeLocations.get(fallbackNode)
}

export {
	getTypeErrorLocation,
}
