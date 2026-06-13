#!/usr/bin/env node

const fs = require('fs')
const http = require('http')
const path = require('path')

const root = path.resolve(__dirname, '..', 'examples', 'wasm_table_aggregate', 'browser')
const port = Number(process.env.PORT ?? 8080)
const host = process.env.HOST ?? '127.0.0.1'

const mimeTypes = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.wasm': 'application/wasm',
}

const server = http.createServer((request, response) => {
	const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
	const pathname = url.pathname === '/'
		? '/index.html'
		: url.pathname
	const filePath = path.join(root, pathname)
	if (!filePath.startsWith(root)) {
		response.writeHead(403)
		response.end('Forbidden')
		return
	}
	if (!fs.existsSync(filePath)) {
		response.writeHead(404)
		response.end(path.extname(filePath) === '.wasm'
			? 'Run yarn demo:wasm-browser:build first'
			: 'Not found')
		return
	}
	response.writeHead(200, {
		'Content-Type': mimeTypes[path.extname(filePath)] ?? 'application/octet-stream',
	})
	fs.createReadStream(filePath).pipe(response)
})

server.on('error', error => {
	console.error(error instanceof Error
		? error.message
		: String(error))
	process.exit(1)
})

server.listen(port, host, () => {
	console.log(`Zephyr Wasm browser demo: http://${host}:${port}`)
	console.log('Run yarn demo:wasm-browser:build first if table_aggregate.wasm is missing.')
})
