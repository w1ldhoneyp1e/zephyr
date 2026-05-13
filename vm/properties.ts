import {
	type Value,
	type VmBoundMethod,
	type VmMethodValue,
	type VmObject,
	type VmStructTemplate,
} from './types'

function getProperty(target: Value, propertyName: string): Value {
	if (propertyName === 'length') {
		if (Array.isArray(target) || typeof target === 'string') {
			return target.length
		}
	}

	if (isVmObject(target)) {
		const ownProperty = target.properties[propertyName]
		if (ownProperty !== undefined) {
			return ownProperty
		}
		if (target.structTemplate !== null) {
			const method = target.structTemplate.methods[propertyName]
			if (method !== undefined) {
				return createBoundMethod(target, method)
			}
		}

		return null
	}

	if (isVmStructTemplate(target)) {
		return target.methods[propertyName] ?? null
	}

	throw new Error(`get_prop: неподдерживаемое свойство ${propertyName}`)
}

function setProperty(target: Value, propertyName: string, value: Value): void {
	if (isVmObject(target)) {
		target.properties[propertyName] = value
		return
	}
	if (isVmStructTemplate(target)) {
		if (!isVmMethodValue(value)) {
			throw new Error(`set_prop: метод ${propertyName} должен быть функцией`)
		}
		target.methods[propertyName] = value
		return
	}
	throw new Error(`set_prop: неподдерживаемое свойство ${propertyName}`)
}

function isVmObject(value: Value): value is VmObject {
	return typeof value === 'object'
		&& value !== null
		&& 'kind' in value
		&& value.kind === 'object'
}

function isVmStructTemplate(value: Value): value is VmStructTemplate {
	return typeof value === 'object'
		&& value !== null
		&& 'kind' in value
		&& value.kind === 'struct'
}

function isVmMethodValue(value: Value): value is VmMethodValue {
	return typeof value === 'object'
		&& value !== null
		&& 'kind' in value
		&& (value.kind === 'closure' || value.kind === 'native')
}

function createBoundMethod(receiver: VmObject, method: VmMethodValue): VmBoundMethod {
	return {
		kind: 'bound_method',
		receiver,
		method,
	}
}

export {
	getProperty,
	isVmObject,
	setProperty,
}
