import {type Value} from './types'

function formatValue(v: Value): string {
	if (v === null) {
		return 'null'
	}
	if (typeof v === 'object' && v !== null && 'kind' in v && v.kind === 'object') {
		const entries = Object.entries(v.properties)
			.map(([name, value]) => `${name}: ${formatValue(value)}`)
			.join(', ')
		const typePrefix = v.typeName === null
			? ''
			: `${v.typeName} `

		return `${typePrefix}{${entries}}`
	}
	if (typeof v === 'object' && v !== null && 'kind' in v && v.kind === 'struct') {
		return `[class ${v.name}]`
	}
	if (typeof v === 'object' && v !== null && 'kind' in v && v.kind === 'bound_method') {
		return '[bound method]'
	}
	if (typeof v === 'object' && v !== null && 'kind' in v && v.kind === 'super_object') {
		return '[super]'
	}
	if (typeof v === 'object' && v !== null && 'kind' in v && v.kind === 'closure') {
		return `[closure fn#${v.template.programIndex}]`
	}
	if (typeof v === 'object' && v !== null && 'kind' in v && v.kind === 'native') {
		return `[native ${v.name}]`
	}
	if (Array.isArray(v)) {
		return `[${v.map(formatValue).join(', ')}]`
	}

	return String(v)
}

export {
	formatValue,
}
