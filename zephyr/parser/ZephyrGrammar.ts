import * as fs from 'fs'
import * as path from 'path'
import {type Grammar} from './grammar'
import {createGrammarFromText} from './TextGrammar'

const GRAMMAR_DIRECTORY = 'grammar'

let cachedGrammar: Grammar | null = null

function createCurrentZephyrGrammar(): Grammar {
	if (cachedGrammar !== null) {
		return cachedGrammar
	}

	const grammarDirectoryPath = resolveGrammarDirectoryPath()
	const source = readGrammarDirectory(grammarDirectoryPath)
	cachedGrammar = createGrammarFromText(source)

	return cachedGrammar
}

function resolveGrammarDirectoryPath(): string {
	const candidates = [
		path.resolve(process.cwd(), 'zephyr/parser', GRAMMAR_DIRECTORY),
		path.resolve(__dirname, GRAMMAR_DIRECTORY),
		path.resolve(__dirname, '../../zephyr/parser', GRAMMAR_DIRECTORY),
	]

	for (const candidate of candidates) {
		if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
			return candidate
		}
	}

	throw new Error(`Не удалось найти grammar-директорию ${GRAMMAR_DIRECTORY}`)
}

function readGrammarDirectory(grammarDirectoryPath: string): string {
	const fileNames = fs.readdirSync(grammarDirectoryPath)
		.filter(fileName => fileName.endsWith('.grammar'))
		.sort()
	if (fileNames.length === 0) {
		throw new Error(`В grammar-директории ${grammarDirectoryPath} нет .grammar файлов`)
	}

	return fileNames
		.map(fileName => fs.readFileSync(path.join(grammarDirectoryPath, fileName), 'utf-8').trim())
		.join('\n\n')
}

export {
	createCurrentZephyrGrammar,
}
