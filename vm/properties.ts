import {type Value, type VmObject} from './types'

function getProperty(target: Value, propertyName: string): Value {
	if (propertyName === 'length') {
		if (Array.isArray(target) || typeof target === 'string') {
			return target.length
		}
	}

	if (isVmObject(target)) {
		return target.properties[propertyName] ?? null
	}

	throw new Error(`get_prop: неподдерживаемое свойство ${propertyName}`)
}

function isVmObject(value: Value): value is VmObject {
	return typeof value === 'object'
		&& value !== null
		&& 'kind' in value
		&& value.kind === 'object'
}

export {
	getProperty,
	isVmObject,
}
