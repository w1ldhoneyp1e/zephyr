import {type ClassMemberVisibility} from '../ast'
import {type SemanticModel} from './context'

interface ClassMemberInfo {
	ownerClassName: string,
	visibility: ClassMemberVisibility,
}

interface ClassInfo {
	name: string,
	baseClassName: string | null,
	fieldTypes: Map<string, string>,
	fieldVisibilities: Map<string, ClassMemberVisibility>,
	constructorParameterTypes: string[],
	methodReturnTypes: Map<string, string>,
	methodParameterTypes: Map<string, string[]>,
	methodVisibilities: Map<string, ClassMemberVisibility>,
}

class ClassRegistry {
	constructor(private readonly model: SemanticModel) {
	}

	getClassInfo(className: string): ClassInfo | null {
		const fieldTypes = this.model.classFieldTypes.get(className)
		if (fieldTypes === undefined) {
			return null
		}

		return {
			name: className,
			baseClassName: this.model.classBaseNames.get(className) ?? null,
			fieldTypes,
			fieldVisibilities: this.model.classFieldVisibilities.get(className) ?? new Map(),
			constructorParameterTypes: this.model.classConstructorParameterTypes.get(className) ?? [],
			methodReturnTypes: this.model.classMethodReturnTypes.get(className) ?? new Map(),
			methodParameterTypes: this.model.classMethodParameterTypes.get(className) ?? new Map(),
			methodVisibilities: this.model.classMethodVisibilities.get(className) ?? new Map(),
		}
	}

	getBaseClassName(className: string): string | null {
		return this.getClassInfo(className)?.baseClassName ?? null
	}

	getConstructorParameterTypes(className: string): string[] {
		return this.getClassInfo(className)?.constructorParameterTypes ?? []
	}

	getFieldType(className: string, property: string): string {
		if (className === 'any') {
			return 'any'
		}
		const classInfo = this.getClassInfo(className)
		if (classInfo === null) {
			return 'any'
		}
		const fieldType = classInfo.fieldTypes.get(property)
		if (fieldType !== undefined) {
			return fieldType
		}
		return classInfo.baseClassName === null
			? 'any'
			: this.getFieldType(classInfo.baseClassName, property)
	}

	getPropertyType(className: string, property: string): string {
		const fieldType = this.getFieldType(className, property)
		if (fieldType !== 'any') {
			return fieldType
		}
		return this.getMethodType(className, property)
	}

	getMethodReturnType(className: string, methodName: string): string {
		if (className === 'any') {
			return 'any'
		}
		const classInfo = this.getClassInfo(className)
		if (classInfo === null) {
			return 'any'
		}
		const returnType = classInfo.methodReturnTypes.get(methodName)
		if (returnType !== undefined) {
			return returnType
		}
		return classInfo.baseClassName === null
			? 'any'
			: this.getMethodReturnType(classInfo.baseClassName, methodName)
	}

	getMethodParameterTypes(className: string, methodName: string): string[] {
		if (className === 'any') {
			return []
		}
		const classInfo = this.getClassInfo(className)
		if (classInfo === null) {
			return []
		}
		const parameterTypes = classInfo.methodParameterTypes.get(methodName)
		if (parameterTypes !== undefined) {
			return parameterTypes
		}
		return classInfo.baseClassName === null
			? []
			: this.getMethodParameterTypes(classInfo.baseClassName, methodName)
	}

	getMethodType(className: string, methodName: string): string {
		if (className === 'any') {
			return 'any'
		}
		const returnType = this.getMethodReturnType(className, methodName)
		if (returnType === 'any') {
			return 'any'
		}
		return `(${this.getMethodParameterTypes(className, methodName).join(', ')}) => ${returnType}`
	}

	getFieldInfo(className: string, fieldName: string): ClassMemberInfo | null {
		if (className === 'any') {
			return null
		}
		const classInfo = this.getClassInfo(className)
		if (classInfo === null) {
			return null
		}
		const visibility = classInfo.fieldVisibilities.get(fieldName)
		if (visibility !== undefined) {
			return {
				ownerClassName: className,
				visibility,
			}
		}
		return classInfo.baseClassName === null
			? null
			: this.getFieldInfo(classInfo.baseClassName, fieldName)
	}

	getMethodInfo(className: string, methodName: string): ClassMemberInfo | null {
		if (className === 'any') {
			return null
		}
		const classInfo = this.getClassInfo(className)
		if (classInfo === null) {
			return null
		}
		const visibility = classInfo.methodVisibilities.get(methodName)
		if (visibility !== undefined) {
			return {
				ownerClassName: className,
				visibility,
			}
		}
		return classInfo.baseClassName === null
			? null
			: this.getMethodInfo(classInfo.baseClassName, methodName)
	}

	getMemberInfo(className: string, memberName: string, preferredKind?: 'field' | 'method'): ClassMemberInfo | null {
		if (preferredKind === 'field') {
			return this.getFieldInfo(className, memberName)
		}
		const fieldInfo = this.getFieldInfo(className, memberName)
		if (fieldInfo !== null) {
			return fieldInfo
		}
		return this.getMethodInfo(className, memberName)
	}

	isSubclassOf(sourceType: string, targetType: string): boolean {
		if (sourceType === targetType) {
			return true
		}
		let current = this.getBaseClassName(sourceType)
		while (current !== null) {
			if (current === targetType) {
				return true
			}
			current = this.getBaseClassName(current)
		}
		return false
	}
}

export {
	type ClassInfo,
	type ClassMemberInfo,
	ClassRegistry,
}
