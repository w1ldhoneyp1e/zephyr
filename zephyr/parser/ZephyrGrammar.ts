import * as fs from 'fs'
import * as path from 'path'
import {type Grammar} from './grammar'
import {createGrammarFromText} from './TextGrammar'

const GRAMMAR_FILENAME = 'zephyr.grammar'

let cachedGrammar: Grammar | null = null

function createCurrentZephyrGrammar(): Grammar {
	if (cachedGrammar !== null) {
		return cachedGrammar
	}

	const grammarPath = resolveGrammarPath()
	const source = fs.readFileSync(grammarPath, 'utf-8')
	cachedGrammar = createGrammarFromText(source)

	return cachedGrammar
}

function resolveGrammarPath(): string {
	const candidates = [
		path.resolve(process.cwd(), 'zephyr/parser', GRAMMAR_FILENAME),
		path.resolve(__dirname, GRAMMAR_FILENAME),
		path.resolve(__dirname, '../../zephyr/parser', GRAMMAR_FILENAME),
	]

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate
		}
	}

	throw new Error(`Не удалось найти grammar-файл ${GRAMMAR_FILENAME}`)
}

export {
	createCurrentZephyrGrammar,
}
