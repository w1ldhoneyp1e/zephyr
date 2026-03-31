import * as fs from 'fs'
import * as path from 'path'
import {formatValue, Vm} from '../vm/Vm'
import {Compiler} from './Compiler'

function main(): void {
	const args = process.argv.slice(2)
	if (args.length === 0) {
		throw new Error('Не передан путь к файлу')
	}
	const fromCwd = path.resolve(process.cwd(), args[0])
	const fromRoot = path.resolve(process.cwd(), '../..', args[0])
	const filePath = fs.existsSync(fromCwd)
		? fromCwd
		: fromRoot
	const source = fs.readFileSync(filePath, 'utf-8')
	const compiler = new Compiler()
	const program = compiler.compile(source)
	const vm = new Vm()
	vm.load([program])
	const result = vm.run()
	if (result !== null) {
		console.log(formatValue(result))
	}
}

main()
