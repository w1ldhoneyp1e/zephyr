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
		const seen = new Set<string>()
		for (const field of fields) {
			if (seen.has(field.name)) {
				throw new Error(`Повторное объявление поля класса: ${field.name}`)
			}
			seen.add(field.name)
		}
	}

	assertUniqueMethodNames(statement: ClassDeclarationNode): void {
		const seen = new Set<string>()
		for (const method of statement.methods) {
			if (seen.has(method.name)) {
				throw new Error(`Повторное объявление метода класса ${statement.name}: ${method.name}`)
			}
			seen.add(method.name)
		}
	}

	assertNoMemberNameConflicts(statement: ClassDeclarationNode): void {
		const fieldNames = new Set(statement.fields.map(field => field.name))
		for (const method of statement.methods) {
			if (fieldNames.has(method.name)) {
				throw new Error(`Конфликт имени члена класса ${statement.name}: ${method.name} объявлен и как поле, и как метод`)
			}
		}
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
