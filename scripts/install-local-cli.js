#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const sourcePath = path.join(projectRoot, 'dist', 'zephyrMain.js')
const binDir = path.join(os.homedir(), '.local', 'bin')
const targetPath = path.join(binDir, 'zephyr')

if (!fs.existsSync(sourcePath)) {
	console.error(`Не найден собранный CLI: ${sourcePath}`)
	console.error('Сначала выполните yarn build')
	process.exit(1)
}

fs.mkdirSync(binDir, {recursive: true})
try {
	fs.rmSync(targetPath, {force: true})
	fs.symlinkSync(sourcePath, targetPath)
	fs.chmodSync(sourcePath, 0o755)
}
catch (error) {
	console.error(error instanceof Error
		? error.message
		: String(error))
	process.exit(1)
}

console.log(`Installed zephyr -> ${targetPath}`)
if (!(process.env.PATH ?? '').split(path.delimiter).includes(binDir)) {
	console.log(`Добавьте ${binDir} в PATH, если команда zephyr не находится.`)
}
