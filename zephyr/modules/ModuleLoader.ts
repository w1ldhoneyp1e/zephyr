import * as fs from 'fs'
import * as path from 'path'
import {
	type ImportNameNode,
	type ImportStatementNode,
	type NamedExportStatementNode,
	type ProgramNode,
	type StatementNode,
} from '../ast'
import {
	type DiagnosticReporter,
	type NodeLocations,
	type PhaseResult,
} from '../diagnostics'
import {match} from '../utils'

interface ModuleDependency {
	names: ImportNameNode[],
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
		private readonly parseSource: (source: string, filePath: string) => PhaseResult<ProgramNode>,
		private readonly reporter: DiagnosticReporter,
		private readonly nodeLocations: NodeLocations,
		private readonly workspaceRoot: string = process.cwd(),
	) {
	}

	loadEntryProgram(filePath: string): PhaseResult<ProgramNode> {
		const entryPath = path.resolve(filePath)
		const statementsResult = this.flattenModule(entryPath, new Set(), [])
		if (!statementsResult.ok || this.reporter.hasErrors()) {
			return this.failure()
		}

		return {
			ok: true,
			value: this.createProgram(statementsResult.value),
		}
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
	): PhaseResult<StatementNode[]> {
		if (emitted.has(filePath)) {
			return {
				ok: true,
				value: [],
			}
		}

		if (!this.checkCycling(filePath, active)) {
			return this.failure()
		}

		active.push(filePath)
		const loadedResult = this.loadModule(filePath)
		if (!loadedResult.ok) {
			active.pop()
			return this.failure()
		}
		const loaded = loadedResult.value
		const statements: StatementNode[] = []

		for (const dependency of loaded.dependencies) {
			const dependencyModuleResult = this.loadModule(dependency.resolvedPath)
			if (!dependencyModuleResult.ok) {
				continue
			}
			const dependencyModule = dependencyModuleResult.value
			for (const name of dependency.names) {
				if (!dependencyModule.exports.has(name.name)) {
					this.reportForNode(
						name,
						this.createMissingExportError(
							loaded.filePath,
							dependency.resolvedPath,
							name.name,
							dependency.kind,
						),
					)
				}
			}
			const dependencyStatementsResult = this.flattenModule(dependency.resolvedPath, emitted, active)
			if (dependencyStatementsResult.ok) {
				statements.push(...dependencyStatementsResult.value)
			}
		}

		statements.push(...this.normalizeStatements(loaded.program.body))
		active.pop()
		emitted.add(filePath)

		return {
			ok: true,
			value: statements,
		}
	}

	private loadModule(filePath: string): PhaseResult<LoadedModule> {
		const cached = this.moduleCache.get(filePath)
		if (cached !== undefined) {
			return {
				ok: true,
				value: cached,
			}
		}

		let source: string
		try {
			source = fs.readFileSync(filePath, 'utf-8')
		}
		catch (error) {
			this.reporter.reportError(error)
			return this.failure()
		}
		const programResult = this.parseSource(source, filePath)
		if (!programResult.ok) {
			return this.failure()
		}
		const program = programResult.value
		const exports = new Set<string>()
		const dependencies: ModuleDependency[] = []
		const availableNames = new Set<string>()

		for (const statement of program.body) {
			match(statement, 'type', {
				ImportStatement: stmnt => {
					const resolvedPath = this.resolveImportPath(filePath, stmnt.source, stmnt)
					if (!resolvedPath.ok) {
						return
					}
					dependencies.push({
						kind: 'import',
						names: stmnt.names,
						resolvedPath: resolvedPath.value,
						statement: stmnt,
					})
					for (const name of stmnt.names) {
						availableNames.add(name.name)
					}
				},
				ExportStatement: stmnt => {
					exports.add(stmnt.statement.name)
					availableNames.add(stmnt.statement.name)
				},
				NamedExportStatement: stmnt => {
					for (const name of stmnt.names) {
						exports.add(name.name)
					}
					const src = stmnt.source
					const reexporting = src !== null

					if (reexporting) {
						const resolvedPath = this.resolveImportPath(filePath, src, stmnt)
						if (!resolvedPath.ok) {
							return
						}
						dependencies.push({
							kind: 'reexport',
							names: stmnt.names,
							resolvedPath: resolvedPath.value,
							statement: stmnt,
						})
					}
					else {
						for (const name of stmnt.names) {
							if (!availableNames.has(name.name)) {
								this.reportForNode(
									name,
									`Модуль ${this.formatModulePath(filePath)} не может экспортировать ${name.name}: имя не объявлено и не импортировано`,
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

		return {
			ok: true,
			value: loaded,
		}
	}

	private resolveImportPath(
		fromFilePath: string,
		importPath: string,
		statement: ImportStatementNode | NamedExportStatementNode,
	): PhaseResult<string> {
		if (!importPath.startsWith('.')) {
			this.reportForStatement(statement, `Пока поддерживаются только относительные импорты: ${importPath}`)
			return this.failure()
		}

		const resolvedPath = path.resolve(path.dirname(fromFilePath), importPath)
		if (!fs.existsSync(resolvedPath)) {
			this.reportForStatement(statement, `Не найден импортируемый модуль: ${resolvedPath}`)
			return this.failure()
		}

		return {
			ok: true,
			value: resolvedPath,
		}
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

	private reportForNode(
		node: ImportNameNode,
		message: string,
	): void {
		this.reporter.error(message, this.nodeLocations.get(node))
	}

	private failure(): PhaseResult<never> {
		return {
			ok: false,
		}
	}
}

export {
	type LoadedModule,
	type ModuleDependency,
	ModuleLoader,
}
