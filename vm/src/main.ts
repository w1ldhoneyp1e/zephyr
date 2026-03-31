import * as fs from 'fs'
import * as path from 'path'
import {Parser} from './Parser'
import {formatValue, Vm} from './Vm'

function main(): void {
	const args = process.argv.slice(2)
	let source: string

	if (args.length > 0) {
		const fromCwd = path.resolve(process.cwd(), args[0])
		const fromRoot = path.resolve(process.cwd(), '../..', args[0])
		const filePath = fs.existsSync(fromCwd)
			? fromCwd
			: fromRoot
		source = fs.readFileSync(filePath, 'utf-8')
	}
	else {
		source = fs.readFileSync('/dev/stdin', 'utf-8')
	}

	const parser = new Parser()
	const programs = parser.parse(source)

	const vm = new Vm()
	vm.load(programs)

	const result = vm.run()
	if (result !== null) {
		console.log(formatValue(result))
	}
}

main()
