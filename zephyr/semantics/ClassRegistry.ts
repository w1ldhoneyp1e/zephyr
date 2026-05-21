import {type ClassMemberVisibility} from '../ast'
import {type SemanticModel} from './context'
import {
	type SemanticType,
	anyType,
	functionType,
} from './SemanticType'

interface ClassMemberInfo {
	ownerClassName: string,
	visibility: ClassMemberVisibility,
}

interface ClassInfo {
	name: string,
	baseClassName: string | null,
	fieldTypes: Map<string, SemanticType>,
	fieldVisibilities: Map<string, ClassMemberVisibility>,
	constructorParameterTypes: SemanticType[],
	methodReturnTypes: Map<string, SemanticType>,
	methodParameterTypes: Map<string, SemanticType[]>,
	methodVisibilities: Map<string, ClassMemberVisibility>,
}

interface ClassDiscriminantVariant {
	className: string,
	value: string | number | boolean | null,
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

	getNarrowedTypeByDiscriminant(
		subjectType: SemanticType,
		discriminant: string,
		patternValue: string | number | boolean | null,
	): SemanticType | null {
		const matchingClasses = this.getDiscriminantCandidateClassNames(subjectType)
			.filter(className => this.getDiscriminantValue(className, discriminant) === patternValue)
		if (matchingClasses.length !== 1) {
			return null
		}
		return {
			kind: 'class',
			name: matchingClasses[0],
		}
	}

	getDiscriminantVariants(
		subjectType: SemanticType,
		discriminant: string,
	): ClassDiscriminantVariant[] {
		const variants = new Map<string, ClassDiscriminantVariant>()
		for (const className of this.getDiscriminantCandidateClassNames(subjectType)) {
			const value = this.getDiscriminantValue(className, discriminant)
			if (value === undefined) {
				continue
			}
			variants.set(this.getDiscriminantVariantKey(value), {
				className,
				value,
			})
		}
		return [...variants.values()]
	}

	private getDiscriminantCandidateClassNames(subjectType: SemanticType): string[] {
		if (subjectType.kind === 'class') {
			return [...this.model.classFieldTypes.keys()].filter(className =>
				this.isSubclassOf({
					kind: 'class',
					name: className,
				}, subjectType),
			)
		}
		if (subjectType.kind === 'union') {
			return subjectType.types
				.filter((type): type is Extract<SemanticType, {kind: 'class'}> => type.kind === 'class')
				.map(type => type.name)
		}
		return []
	}

	getConstructorParameterTypes(className: string): SemanticType[] {
		return this.getClassInfo(className)?.constructorParameterTypes ?? []
	}

	getFieldType(classType: SemanticType, property: string): SemanticType {
		if (classType.kind === 'any') {
			return anyType()
		}
		if (classType.kind !== 'class') {
			return anyType()
		}
		const classInfo = this.getClassInfo(classType.name)
		if (classInfo === null) {
			return anyType()
		}
		const fieldType = classInfo.fieldTypes.get(property)
		if (fieldType !== undefined) {
			return fieldType
		}
		return classInfo.baseClassName === null
			? anyType()
			: this.getFieldType({
				kind: 'class',
				name: classInfo.baseClassName,
			}, property)
	}

	getPropertyType(classType: SemanticType, property: string): SemanticType {
		const fieldType = this.getFieldType(classType, property)
		if (fieldType.kind !== 'any') {
			return fieldType
		}
		return this.getMethodType(classType, property)
	}

	getMethodReturnType(classType: SemanticType, methodName: string): SemanticType {
		if (classType.kind === 'any') {
			return anyType()
		}
		if (classType.kind !== 'class') {
			return anyType()
		}
		const classInfo = this.getClassInfo(classType.name)
		if (classInfo === null) {
			return anyType()
		}
		const returnType = classInfo.methodReturnTypes.get(methodName)
		if (returnType !== undefined) {
			return returnType
		}
		return classInfo.baseClassName === null
			? anyType()
			: this.getMethodReturnType({
				kind: 'class',
				name: classInfo.baseClassName,
			}, methodName)
	}

	getMethodParameterTypes(classType: SemanticType, methodName: string): SemanticType[] {
		if (classType.kind === 'any') {
			return []
		}
		if (classType.kind !== 'class') {
			return []
		}
		const classInfo = this.getClassInfo(classType.name)
		if (classInfo === null) {
			return []
		}
		const parameterTypes = classInfo.methodParameterTypes.get(methodName)
		if (parameterTypes !== undefined) {
			return parameterTypes
		}
		return classInfo.baseClassName === null
			? []
			: this.getMethodParameterTypes({
				kind: 'class',
				name: classInfo.baseClassName,
			}, methodName)
	}

	getMethodType(classType: SemanticType, methodName: string): SemanticType {
		if (classType.kind === 'any') {
			return anyType()
		}
		const returnType = this.getMethodReturnType(classType, methodName)
		if (returnType.kind === 'any') {
			return anyType()
		}
		return functionType(this.getMethodParameterTypes(classType, methodName), returnType)
	}

	getFieldInfo(classType: SemanticType, fieldName: string): ClassMemberInfo | null {
		if (classType.kind === 'any') {
			return null
		}
		if (classType.kind !== 'class') {
			return null
		}
		const classInfo = this.getClassInfo(classType.name)
		if (classInfo === null) {
			return null
		}
		const visibility = classInfo.fieldVisibilities.get(fieldName)
		if (visibility !== undefined) {
			return {
				ownerClassName: classType.name,
				visibility,
			}
		}
		return classInfo.baseClassName === null
			? null
			: this.getFieldInfo({
				kind: 'class',
				name: classInfo.baseClassName,
			}, fieldName)
	}

	getMethodInfo(classType: SemanticType, methodName: string): ClassMemberInfo | null {
		if (classType.kind === 'any') {
			return null
		}
		if (classType.kind !== 'class') {
			return null
		}
		const classInfo = this.getClassInfo(classType.name)
		if (classInfo === null) {
			return null
		}
		const visibility = classInfo.methodVisibilities.get(methodName)
		if (visibility !== undefined) {
			return {
				ownerClassName: classType.name,
				visibility,
			}
		}
		return classInfo.baseClassName === null
			? null
			: this.getMethodInfo({
				kind: 'class',
				name: classInfo.baseClassName,
			}, methodName)
	}

	getMemberInfo(classType: SemanticType, memberName: string, preferredKind?: 'field' | 'method'): ClassMemberInfo | null {
		if (preferredKind === 'field') {
			return this.getFieldInfo(classType, memberName)
		}
		const fieldInfo = this.getFieldInfo(classType, memberName)
		if (fieldInfo !== null) {
			return fieldInfo
		}
		return this.getMethodInfo(classType, memberName)
	}

	isSubclassOf(sourceType: SemanticType, targetType: SemanticType): boolean {
		if (sourceType.kind !== 'class' || targetType.kind !== 'class') {
			return false
		}
		if (sourceType.name === targetType.name) {
			return true
		}
		let current = this.getBaseClassName(sourceType.name)
		while (current !== null) {
			if (current === targetType.name) {
				return true
			}
			current = this.getBaseClassName(current)
		}
		return false
	}

	private getDiscriminantValue(
		className: string,
		discriminant: string,
	): string | number | boolean | null | undefined {
		const ownValue = this.model.classDiscriminantValues.get(className)?.get(discriminant)
		if (ownValue !== undefined) {
			return ownValue
		}
		const baseClassName = this.getBaseClassName(className)
		return baseClassName === null
			? undefined
			: this.getDiscriminantValue(baseClassName, discriminant)
	}

	private getDiscriminantVariantKey(value: string | number | boolean | null): string {
		return `${typeof value}:${String(value)}`
	}
}

export {
	type ClassInfo,
	type ClassDiscriminantVariant,
	type ClassMemberInfo,
	ClassRegistry,
}
