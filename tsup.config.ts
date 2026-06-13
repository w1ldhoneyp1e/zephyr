import {defineConfig} from 'tsup'

export default defineConfig({
	entry: {
		main: 'vm/main.ts',
		index: 'vm/index.ts',
		zephyrMain: 'zephyr/main.ts',
	},
	banner: {
		js: '#!/usr/bin/env node',
	},
	format: ['cjs'],
	target: 'node18',
	clean: true,
	splitting: false,
	sourcemap: true,
})
