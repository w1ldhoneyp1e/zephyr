import * as fs from 'fs'
import * as path from 'path'
import {type ProgramNode, type StatementNode} from '../ast'
import {match} from '../utils'

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

class ModuleLoader {
	private readonly moduleCache = new Map<string, LoadedModule>()

	constructor(
		private readonly parseSource: (source: string) => ProgramNode,
		private readonly workspaceRoot: string = process.cwd(),
	) {
	}

	loadEntryProgram(filePath: string): ProgramNode {
		const entryPath = path.resolve(filePath)
		const statements = this.flattenModule(entryPath, new Set(), [])

		return this.createProgram(statements)
	}

	private createProgram(statements: StatementNode[]): ProgramNode {
		return {
			type: 'Program',
			body: this.normalizeStatements(statements),
		}
	}

	private flattenModule(
		filePath: string,
		emitted: Set<string>,
		active: string[],
	): StatementNode[] {
		if (emitted.has(filePath)) {
			return []
		}

		this.checkCycling(filePath, active)

		active.push(filePath)
		const loaded = this.loadModule(filePath)
		const statements: StatementNode[] = []

		for (const dependency of loaded.dependencies) {
			const dependencyModule = this.loadModule(dependency.resolvedPath)
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
			statements.push(...this.flattenModule(dependency.resolvedPath, emitted, active))
		}

		statements.push(...this.normalizeStatements(loaded.program.body))
		active.pop()
		emitted.add(filePath)

		return statements
	}

	private loadModule(filePath: string): LoadedModule {
		const cached = this.moduleCache.get(filePath)
		if (cached !== undefined) {
			return cached
		}

		const source = fs.readFileSync(filePath, 'utf-8')
		const program = this.parseSource(source)
		const exports = new Set<string>()
		const dependencies: ModuleDependency[] = []
		const availableNames = new Set<string>()

		for (const statement of program.body) {
			match(statement, 'type', {
				ImportStatement: stmnt => {
					dependencies.push({
						kind: 'import',
						names: stmnt.names,
						resolvedPath: this.resolveImportPath(filePath, stmnt.source),
					})
					for (const name of stmnt.names) {
						availableNames.add(name)
					}
				},
				ExportStatement: stmnt => {
					exports.add(stmnt.statement.name)
					availableNames.add(stmnt.statement.name)
				},
				NamedExportStatement: stmnt => {
					for (const name of stmnt.names) {
						exports.add(name)
					}
					const src = stmnt.source
					const reexporting = src !== null

					if (reexporting) {
						dependencies.push({
							kind: 'reexport',
							names: stmnt.names,
							resolvedPath: this.resolveImportPath(filePath, source),
						})
					}
					else {
						for (const name of stmnt.names) {
							if (!availableNames.has(name)) {
								throw new Error(
									`Модуль ${this.formatModulePath(filePath)} не может экспортировать ${name}: имя не объявлено и не импортировано`,
								)
							}
						}
					}
				},
				default: stmnt => {
					if ('name' in stmnt) {
						availableNames.add(stmnt.name)
					}
				},
			})
		}

		const loaded: LoadedModule = {
			filePath,
			program,
			dependencies,
			exports,
		}
		this.moduleCache.set(filePath, loaded)

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

	private normalizeStatements(statements: StatementNode[]): StatementNode[] {
		const normalized: StatementNode[] = []
		for (const statement of statements) {
			if (statement.type === 'ImportStatement' || statement.type === 'NamedExportStatement') {
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

	private checkCycling(
		filePath: string,
		active: string[],
	) {
		const cycleStartIdx = active.indexOf(filePath)
		if (cycleStartIdx !== -1) {
			const cycle = [...active.slice(cycleStartIdx), filePath]
				.map(this.formatModulePath)
				.join(' -> ')
			throw new Error(`Циклический импорт: ${cycle}`)
		}
	}

	private formatModulePath(filePath: string): string {
		return path.relative(this.workspaceRoot, filePath)
	}
}

export {
	type LoadedModule,
	type ModuleDependency,
	ModuleLoader,
}
