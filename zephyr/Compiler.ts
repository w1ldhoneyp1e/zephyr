import * as fs from 'fs'
import * as path from 'path'
import {type VmProgram} from '../vm/types'
import {type ProgramNode, type StatementNode} from './ast'
import {BytecodeGenerator} from './bytecode/BytecodeGenerator'
import {Lexer} from './Lexer'
import {LalrAstParser} from './parser/LalrAstParser'
import {Resolver, Validator} from './semantics'

interface LoadedModule {
	filePath: string,
	program: ProgramNode,
	imports: {
		names: string[],
		resolvedPath: string,
	}[],
	exports: Set<string>,
}

class Compiler {
	compile(source: string): VmProgram[] {
		return this.compileProgram(this.parseSource(source))
	}

	compilePath(filePath: string): VmProgram[] {
		const moduleCache = new Map<string, LoadedModule>()
		const emitted = new Set<string>()
		const active = new Set<string>()
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
		active: Set<string>,
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
		active: Set<string>,
	): StatementNode[] {
		if (emitted.has(filePath)) {
			return []
		}
		if (active.has(filePath)) {
			throw new Error(`Циклический импорт: ${filePath}`)
		}

		active.add(filePath)
		const loaded = this.loadModule(filePath, moduleCache)
		const statements: StatementNode[] = []

		for (const imported of loaded.imports) {
			const importedModule = this.loadModule(imported.resolvedPath, moduleCache)
			for (const name of imported.names) {
				if (!importedModule.exports.has(name)) {
					throw new Error(`Модуль ${imported.resolvedPath} не экспортирует ${name}`)
				}
			}
			statements.push(...this.flattenModule(imported.resolvedPath, moduleCache, emitted, active))
		}

		statements.push(...this.normalizeStatements(loaded.program.body))
		active.delete(filePath)
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
		const imports = program.body
			.filter(statement => statement.type === 'ImportStatement')
			.map(statement => ({
				names: statement.names,
				resolvedPath: this.resolveImportPath(filePath, statement.source),
			}))
		const exports = new Set<string>()
		for (const statement of program.body) {
			if (statement.type !== 'ExportStatement') {
				continue
			}
			exports.add(statement.statement.name)
		}

		const loaded: LoadedModule = {
			filePath,
			program,
			imports,
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
			if (statement.type === 'ExportStatement') {
				normalized.push(statement.statement)
				continue
			}
			normalized.push(statement)
		}

		return normalized
	}
}

export {
	Compiler,
}
