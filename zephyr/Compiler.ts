import * as fs from 'fs'
import * as path from 'path'
import {type VmProgram} from '../vm/types'
import {type ProgramNode, type StatementNode} from './ast'
import {BytecodeGenerator} from './bytecode/BytecodeGenerator'
import {Lexer} from './Lexer'
import {LalrAstParser} from './parser/LalrAstParser'
import {Resolver, Validator} from './semantics'

interface ModuleDependency {
	names: string[],
	resolvedPath: string,
	kind: 'import' | 'reexport',
}

interface LoadedModule {
	filePath: string,
	program: ProgramNode,
	dependencies: ModuleDependency[],
	exports: Set<string>,
}

class Compiler {
	compile(source: string): VmProgram[] {
		return this.compileProgram(this.parseSource(source))
	}

	compilePath(filePath: string): VmProgram[] {
		const moduleCache = new Map<string, LoadedModule>()
		const emitted = new Set<string>()
		const active: string[] = []
		const entryPath = path.resolve(filePath)
		const program = this.buildModuleProgram(entryPath, moduleCache, emitted, active)

		return this.compileProgram(program)
	}

	private compileProgram(program: ProgramNode): VmProgram[] {
		const normalizedProgram = this.normalizeProgram(program)
		const resolver = new Resolver()
		const {program: resolvedProgram, model} = resolver.resolveProgram(normalizedProgram)
		const validator = new Validator()
		const validatedProgram = validator.validateProgram(resolvedProgram, model)
		const generator = new BytecodeGenerator()

		return generator.generate(validatedProgram, model)
	}

	private parseSource(source: string): ProgramNode {
		const lexer = new Lexer(source)
		const tokens = lexer.scanTokens()
		const parser = new LalrAstParser(tokens)

		return parser.parseProgram()
	}

	private buildModuleProgram(
		entryPath: string,
		moduleCache: Map<string, LoadedModule>,
		emitted: Set<string>,
		active: string[],
	): ProgramNode {
		const statements = this.flattenModule(entryPath, moduleCache, emitted, active)

		return {
			type: 'Program',
			body: statements,
		}
	}

	private flattenModule(
		filePath: string,
		moduleCache: Map<string, LoadedModule>,
		emitted: Set<string>,
		active: string[],
	): StatementNode[] {
		if (emitted.has(filePath)) {
			return []
		}
		const cycleStart = active.indexOf(filePath)
		if (cycleStart !== -1) {
			const cycle = [...active.slice(cycleStart), filePath]
				.map(currentPath => path.relative(process.cwd(), currentPath))
				.join(' -> ')
			throw new Error(`Циклический импорт: ${cycle}`)
		}

		active.push(filePath)
		const loaded = this.loadModule(filePath, moduleCache)
		const statements: StatementNode[] = []

		for (const dependency of loaded.dependencies) {
			const dependencyModule = this.loadModule(dependency.resolvedPath, moduleCache)
			for (const name of dependency.names) {
				if (!dependencyModule.exports.has(name)) {
					throw new Error(this.createMissingExportError(
						loaded.filePath,
						dependency.resolvedPath,
						name,
						dependency.kind,
					))
				}
			}
			statements.push(...this.flattenModule(dependency.resolvedPath, moduleCache, emitted, active))
		}

		statements.push(...this.normalizeStatements(loaded.program.body))
		active.pop()
		emitted.add(filePath)

		return statements
	}

	private loadModule(filePath: string, moduleCache: Map<string, LoadedModule>): LoadedModule {
		const cached = moduleCache.get(filePath)
		if (cached !== undefined) {
			return cached
		}

		const source = fs.readFileSync(filePath, 'utf-8')
		const program = this.parseSource(source)
		const exports = new Set<string>()
		const dependencies: ModuleDependency[] = []
		const availableNames = new Set<string>()
		for (const statement of program.body) {
			if (statement.type === 'ImportStatement') {
				dependencies.push({
					kind: 'import',
					names: statement.names,
					resolvedPath: this.resolveImportPath(filePath, statement.source),
				})
				for (const name of statement.names) {
					availableNames.add(name)
				}
				continue
			}
			if (statement.type === 'ExportStatement') {
				exports.add(statement.statement.name)
				availableNames.add(statement.statement.name)
				continue
			}
			if (statement.type === 'NamedExportStatement') {
				for (const name of statement.names) {
					exports.add(name)
				}
				if (statement.source !== null) {
					dependencies.push({
						kind: 'reexport',
						names: statement.names,
						resolvedPath: this.resolveImportPath(filePath, statement.source),
					})
					continue
				}
				for (const name of statement.names) {
					if (!availableNames.has(name)) {
						throw new Error(
							`Модуль ${this.formatModulePath(filePath)} не может экспортировать ${name}: имя не объявлено и не импортировано`,
						)
					}
				}
				continue
			}
			if ('name' in statement) {
				availableNames.add(statement.name)
			}
		}

		const loaded: LoadedModule = {
			filePath,
			program,
			dependencies,
			exports,
		}
		moduleCache.set(filePath, loaded)

		return loaded
	}

	private resolveImportPath(fromFilePath: string, importPath: string): string {
		if (!importPath.startsWith('.')) {
			throw new Error(`Пока поддерживаются только относительные импорты: ${importPath}`)
		}

		const resolvedPath = path.resolve(path.dirname(fromFilePath), importPath)
		if (!fs.existsSync(resolvedPath)) {
			throw new Error(`Не найден импортируемый модуль: ${resolvedPath}`)
		}

		return resolvedPath
	}

	private normalizeProgram(program: ProgramNode): ProgramNode {
		return {
			type: 'Program',
			body: this.normalizeStatements(program.body),
		}
	}

	private normalizeStatements(statements: StatementNode[]): StatementNode[] {
		const normalized: StatementNode[] = []
		for (const statement of statements) {
			if (statement.type === 'ImportStatement') {
				continue
			}
			if (statement.type === 'NamedExportStatement') {
				continue
			}
			if (statement.type === 'ExportStatement') {
				normalized.push(statement.statement)
				continue
			}
			normalized.push(statement)
		}

		return normalized
	}

	private createMissingExportError(
		fromFilePath: string,
		dependencyPath: string,
		name: string,
		kind: ModuleDependency['kind'],
	): string {
		const action = kind === 'reexport'
			? 'реэкспортирует'
			: 'импортирует'

		return `Модуль ${this.formatModulePath(fromFilePath)} ${action} ${name} из ${this.formatModulePath(dependencyPath)}, но этот модуль его не экспортирует`
	}

	private formatModulePath(filePath: string): string {
		return path.relative(process.cwd(), filePath)
	}
}

export {
	Compiler,
}
