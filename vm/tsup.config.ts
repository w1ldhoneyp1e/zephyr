import {defineConfig} from 'tsup'

export default defineConfig({
	entry: {
		main: 'src/main.ts',
		index: 'src/index.ts',
	},
	format: ['cjs'],
	target: 'node18',
	clean: true,
	splitting: false,
	sourcemap: true,
})
