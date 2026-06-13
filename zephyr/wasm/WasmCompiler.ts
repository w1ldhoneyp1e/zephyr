import {readFileSync} from 'node:fs'
import {type ProgramNode} from '../ast'
import {
	DiagnosticReporter,
	diagnosticToMessage,
	NodeLocations,
} from '../diagnostics'
import {Lexer} from '../Lexer'
import {LalrAstParser} from '../parser/LalrAstParser'
import {type WasmModuleIr} from './WasmIr'
import {lowerProgramToWasmIr} from './WasmLowerer'

function compileZephyrFileToWasmModule(filePath: string): WasmModuleIr {
	return compileZephyrSourceToWasmModule(readFileSync(filePath, 'utf8'), filePath)
}

function compileZephyrSourceToWasmModule(source: string, sourceFile = 'wasm-source.zph'): WasmModuleIr {
	return lowerProgramToWasmIr(parseProgram(source, sourceFile))
}

function parseProgram(source: string, sourceFile: string): ProgramNode {
	const reporter = new DiagnosticReporter()
	const nodeLocations = new NodeLocations()
	const lexer = new Lexer(source, reporter, sourceFile)
	const tokens = lexer.scanTokens()
	if (reporter.hasErrors()) {
		throw new Error(formatDiagnostics(reporter))
	}
	const parser = new LalrAstParser(tokens, sourceFile, nodeLocations, reporter)
	const result = parser.parseProgram()
	if (!result.ok || reporter.hasErrors()) {
		throw new Error(formatDiagnostics(reporter))
	}

	return result.value
}

function formatDiagnostics(reporter: DiagnosticReporter): string {
	return reporter.getDiagnostics()
		.map(diagnosticToMessage)
		.join('\n')
}

export {
	compileZephyrFileToWasmModule,
	compileZephyrSourceToWasmModule,
}
