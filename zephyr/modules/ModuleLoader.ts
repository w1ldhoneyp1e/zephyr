import * as fs from 'fs'
import * as path from 'path'
import {
	type ImportStatementNode,
	type NamedExportStatementNode,
	type ProgramNode,
	type StatementNode,
} from '../ast'
import {type DiagnosticReporter, type NodeLocations} from '../diagnostics'
import {match} from '../utils'

interface ModuleDependency {
	names: string[],
	resolvedPath: string,
	kind: 'import' | 'reexport',
	statement: ImportStatementNode | NamedExportStatementNode,
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
		private readonly parseSource: (source: string, filePath: string) => ProgramNode | null,
		private readonly reporter: DiagnosticReporter,
		private readonly nodeLocations: NodeLocations,
		private readonly workspaceRoot: string = process.cwd(),
	) {
	}

	loadEntryProgram(filePath: string): ProgramNode | null {
		const entryPath = path.resolve(filePath)
		const statements = this.flattenModule(entryPath, new Set(), [])
		if (statements === null || this.reporter.hasErrors()) {
			return null
		}

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
	): StatementNode[] | null {
		if (emitted.has(filePath)) {
			return []
		}

		if (!this.checkCycling(filePath, active)) {
			return null
		}

		active.push(filePath)
		const loaded = this.loadModule(filePath)
		if (loaded === null) {
			active.pop()
			return null
		}
		const statements: StatementNode[] = []

		for (const dependency of loaded.dependencies) {
			const dependencyModule = this.loadModule(dependency.resolvedPath)
			if (dependencyModule === null) {
				continue
			}
			for (const name of dependency.names) {
				if (!dependencyModule.exports.has(name)) {
					this.reportForStatement(
						dependency.statement,
						this.createMissingExportError(
							loaded.filePath,
							dependency.resolvedPath,
							name,
							dependency.kind,
						),
					)
				}
			}
			const dependencyStatements = this.flattenModule(dependency.resolvedPath, emitted, active)
			if (dependencyStatements !== null) {
				statements.push(...dependencyStatements)
			}
		}

		statements.push(...this.normalizeStatements(loaded.program.body))
		active.pop()
		emitted.add(filePath)

		return statements
	}

	private loadModule(filePath: string): LoadedModule | null {
		const cached = this.moduleCache.get(filePath)
		if (cached !== undefined) {
			return cached
		}

		let source: string
		try {
			source = fs.readFileSync(filePath, 'utf-8')
		}
		catch (error) {
			this.reporter.reportError(error)
			return null
		}
		const program = this.parseSource(source, filePath)
		if (program === null) {
			return null
		}
		const exports = new Set<string>()
		const dependencies: ModuleDependency[] = []
		const availableNames = new Set<string>()

		for (const statement of program.body) {
			match(statement, 'type', {
				ImportStatement: stmnt => {
					const resolvedPath = this.resolveImportPath(filePath, stmnt.source, stmnt)
					if (resolvedPath === null) {
						return
					}
					dependencies.push({
						kind: 'import',
						names: stmnt.names,
						resolvedPath,
						statement: stmnt,
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
						const resolvedPath = this.resolveImportPath(filePath, src, stmnt)
						if (resolvedPath === null) {
							return
						}
						dependencies.push({
							kind: 'reexport',
							names: stmnt.names,
							resolvedPath,
							statement: stmnt,
						})
					}
					else {
						for (const name of stmnt.names) {
							if (!availableNames.has(name)) {
								this.reportForStatement(
									stmnt,
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

	private resolveImportPath(
		fromFilePath: string,
		importPath: string,
		statement: ImportStatementNode | NamedExportStatementNode,
	): string | null {
		if (!importPath.startsWith('.')) {
			this.reportForStatement(statement, `Пока поддерживаются только относительные импорты: ${importPath}`)
			return null
		}

		const resolvedPath = path.resolve(path.dirname(fromFilePath), importPath)
		if (!fs.existsSync(resolvedPath)) {
			this.reportForStatement(statement, `Не найден импортируемый модуль: ${resolvedPath}`)
			return null
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
	): boolean {
		const cycleStartIdx = active.indexOf(filePath)
		if (cycleStartIdx !== -1) {
			const cycle = [...active.slice(cycleStartIdx), filePath]
				.map(this.formatModulePath)
				.join(' -> ')
			this.reporter.error(`Циклический импорт: ${cycle}`)
			return false
		}
		return true
	}

	private formatModulePath(filePath: string): string {
		return path.relative(this.workspaceRoot, filePath)
	}

	private reportForStatement(
		statement: ImportStatementNode | NamedExportStatementNode,
		message: string,
	): void {
		this.reporter.error(message, this.nodeLocations.get(statement))
	}
}

export {
	type LoadedModule,
	type ModuleDependency,
	ModuleLoader,
}
