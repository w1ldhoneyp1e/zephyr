import {
	type ClassDeclarationNode,
	type ClassFieldNode,
	type MethodDeclarationNode,
} from '../../ast'
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
		const duplicateField = this.getDuplicateFields(fields)[0]
		if (duplicateField !== undefined) {
			throw new Error(`Повторное объявление поля класса: ${duplicateField.name}`)
		}
	}

	assertUniqueMethodNames(statement: ClassDeclarationNode): void {
		const duplicateMethod = this.getDuplicateMethods(statement)[0]
		if (duplicateMethod !== undefined) {
			throw new Error(`Повторное объявление метода класса ${statement.name}: ${duplicateMethod.name}`)
		}
	}

	assertNoMemberNameConflicts(statement: ClassDeclarationNode): void {
		const conflictMethod = this.getMemberNameConflicts(statement)[0]
		if (conflictMethod !== undefined) {
			throw new Error(`Конфликт имени члена класса ${statement.name}: ${conflictMethod.name} объявлен и как поле, и как метод`)
		}
	}

	getDuplicateFields(fields: ClassFieldNode[]): ClassFieldNode[] {
		const seen = new Set<string>()
		const duplicateNames = new Set<string>()
		const duplicates: ClassFieldNode[] = []
		for (const field of fields) {
			if (seen.has(field.name) && !duplicateNames.has(field.name)) {
				duplicateNames.add(field.name)
				duplicates.push(field)
			}
			seen.add(field.name)
		}

		return duplicates
	}

	getDuplicateMethods(statement: ClassDeclarationNode): MethodDeclarationNode[] {
		const seen = new Set<string>()
		const duplicateNames = new Set<string>()
		const duplicates: MethodDeclarationNode[] = []
		for (const method of statement.methods) {
			if (seen.has(method.name) && !duplicateNames.has(method.name)) {
				duplicateNames.add(method.name)
				duplicates.push(method)
			}
			seen.add(method.name)
		}

		return duplicates
	}

	getMemberNameConflicts(statement: ClassDeclarationNode): MethodDeclarationNode[] {
		const fieldNames = new Set(statement.fields.map(field => field.name))
		const conflictNames = new Set<string>()
		const conflicts: MethodDeclarationNode[] = []
		for (const method of statement.methods) {
			if (fieldNames.has(method.name) && !conflictNames.has(method.name)) {
				conflictNames.add(method.name)
				conflicts.push(method)
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
