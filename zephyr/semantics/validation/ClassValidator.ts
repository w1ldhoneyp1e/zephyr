import {type ClassDeclarationNode, type ClassFieldNode} from '../../ast'
import {type ClassRegistry} from '../ClassRegistry'
import {type SemanticModel} from '../context'
import {type SemanticType, formatSemanticType} from '../SemanticType'

class ClassValidator {
	constructor(
		private readonly model: SemanticModel,
		private readonly classRegistry: ClassRegistry,
		private readonly getCurrentClassName: () => string | null,
	) {
	}

	assertValidBaseClass(statement: ClassDeclarationNode): void {
		if (statement.baseClassName === null) {
			return
		}
		const baseBinding = this.model.classBaseBindings.get(statement)
		if (baseBinding === undefined) {
			throw new Error(`Базовый класс ${statement.baseClassName} для ${statement.name} не разрешён`)
		}
	}

	assertNoInheritanceCycle(className: string): void {
		const seen = new Set<string>([className])
		let current = this.classRegistry.getBaseClassName(className)
		while (current !== null) {
			if (seen.has(current)) {
				throw new Error(`Циклическое наследование классов: ${[...seen, current].join(' -> ')}`)
			}
			seen.add(current)
			current = this.classRegistry.getBaseClassName(current)
		}
	}

	assertUniqueFieldNames(fields: ClassFieldNode[]): void {
		const duplicateName = this.getDuplicateFieldNames(fields)[0]
		if (duplicateName !== undefined) {
			throw new Error(`Повторное объявление поля класса: ${duplicateName}`)
		}
	}

	assertUniqueMethodNames(statement: ClassDeclarationNode): void {
		const duplicateName = this.getDuplicateMethodNames(statement)[0]
		if (duplicateName !== undefined) {
			throw new Error(`Повторное объявление метода класса ${statement.name}: ${duplicateName}`)
		}
	}

	assertNoMemberNameConflicts(statement: ClassDeclarationNode): void {
		const conflictName = this.getMemberNameConflicts(statement)[0]
		if (conflictName !== undefined) {
			throw new Error(`Конфликт имени члена класса ${statement.name}: ${conflictName} объявлен и как поле, и как метод`)
		}
	}

	getDuplicateFieldNames(fields: ClassFieldNode[]): string[] {
		const seen = new Set<string>()
		const duplicates: string[] = []
		for (const field of fields) {
			if (seen.has(field.name) && !duplicates.includes(field.name)) {
				duplicates.push(field.name)
			}
			seen.add(field.name)
		}

		return duplicates
	}

	getDuplicateMethodNames(statement: ClassDeclarationNode): string[] {
		const seen = new Set<string>()
		const duplicates: string[] = []
		for (const method of statement.methods) {
			if (seen.has(method.name) && !duplicates.includes(method.name)) {
				duplicates.push(method.name)
			}
			seen.add(method.name)
		}

		return duplicates
	}

	getMemberNameConflicts(statement: ClassDeclarationNode): string[] {
		const fieldNames = new Set(statement.fields.map(field => field.name))
		const conflicts: string[] = []
		for (const method of statement.methods) {
			if (fieldNames.has(method.name) && !conflicts.includes(method.name)) {
				conflicts.push(method.name)
			}
		}

		return conflicts
	}

	assertClassMemberAccessible(
		classType: SemanticType,
		memberName: string,
		preferredKind?: 'field' | 'method',
	): void {
		if (this.isNullableType(classType)) {
			throw new Error(`Нельзя обращаться к члену ${memberName} у nullable-типа ${formatSemanticType(classType)}`)
		}
		if (classType.kind === 'any' || classType.kind === 'error') {
			return
		}
		const member = preferredKind === 'field'
			? this.classRegistry.getFieldInfo(classType, memberName)
			: this.classRegistry.getMemberInfo(classType, memberName)
		if (member === null || member.visibility === 'public') {
			return
		}
		if (this.getCurrentClassName() === member.ownerClassName) {
			return
		}
		throw new Error(`Нельзя обращаться к private-члену ${member.ownerClassName}.${memberName} вне класса ${member.ownerClassName}`)
	}

	getClassRegistry(): ClassRegistry {
		return this.classRegistry
	}

	private isNullableType(type: SemanticType): boolean {
		return type.kind === 'union'
			&& type.types.some(item => item.kind === 'primitive' && item.name === 'null')
	}
}

export {
	ClassValidator,
}
