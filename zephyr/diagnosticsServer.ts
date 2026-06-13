import * as readline from 'readline'
import {Compiler} from './Compiler'

interface CheckRequest {
	id: number,
	filePath: string,
	source: string,
}

const compiler = new Compiler()
const input = readline.createInterface({
	input: process.stdin,
	terminal: false,
})

input.on('line', line => {
	try {
		const request = JSON.parse(line) as CheckRequest
		const result = compiler.checkSource(request.source, request.filePath)
		process.stdout.write(`${JSON.stringify({
			id: request.id,
			...result,
		})}\n`)
	}
	catch (error) {
		process.stdout.write(`${JSON.stringify({
			id: null,
			ok: false,
			diagnostics: [
				{
					severity: 'error',
					message: error instanceof Error
						? error.message
						: String(error),
					location: null,
				},
			],
		})}\n`)
	}
})
