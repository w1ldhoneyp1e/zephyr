
import {fixupPluginRules} from '@eslint/compat'
import stylisticPlugin from '@stylistic/eslint-plugin'
import tseslintPlugin from '@typescript-eslint/eslint-plugin'
import tseslintParser from '@typescript-eslint/parser'
import importPlugin from 'eslint-plugin-import'
import importNewLinesPlugin from 'eslint-plugin-import-newlines'
import eslintPluginJsonc from 'eslint-plugin-jsonc'
import sortExportPlugin from 'eslint-plugin-sort-exports'
import eslintPluginYml from 'eslint-plugin-yml'
import globals from 'globals'

function getFixedBrowserGlobals() {
	// https://github.com/sindresorhus/globals/issues/239
	const GLOBALS_BROWSER_FIX = {
		...globals.browser,
		AudioWorkletGlobalScope: globals.browser['AudioWorkletGlobalScope'],
	}
	delete GLOBALS_BROWSER_FIX['AudioWorkletGlobalScope']

	return GLOBALS_BROWSER_FIX
}

export default [
	{
		files: ['**/*.{js,mjs,cjs,ts,jsx,json,yaml,yml}'],
	},
	{
		ignores: [
			'.cache/',
			'node_modules',
			'**/dist/**',
		],
	},
	{
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: {
				...getFixedBrowserGlobals(),
				...globals.node,
				...globals.jest,
			},
		},
	},
	{
		// Js rules from eslint
		// https://eslint.org/docs/latest/rules/
		rules: {
			// Possible Problems
			'array-callback-return': 'error',
			'constructor-super': 'error',
			'for-direction': 'error',
			'getter-return': 'error',
			'no-async-promise-executor': 'error',
			'no-class-assign': 'error',
			'no-compare-neg-zero': 'error',
			'no-cond-assign': 'error',
			'no-const-assign': 'error',
			'no-constant-binary-expression': 'error',
			'no-constructor-return': 'error',
			'no-control-regex': 'error',
			'no-dupe-args': 'error',
			'no-dupe-class-members': 'error',
			'no-dupe-else-if': 'error',
			'no-dupe-keys': 'error',
			'no-duplicate-case': 'error',
			'no-duplicate-imports': 'off',
			'no-empty-character-class': 'error',
			'no-empty-pattern': 'error',
			'no-ex-assign': 'error',
			'no-fallthrough': 'error',
			'no-func-assign': 'error',
			'no-import-assign': 'error',
			'no-inner-declarations': ['error',
				'functions'],
			'no-invalid-regexp': 'error',
			'no-irregular-whitespace': 'error',
			'no-loss-of-precision': 'error',
			'no-misleading-character-class': 'error',
			'no-new-native-nonconstructor': 'error',
			'no-obj-calls': 'error',
			'no-promise-executor-return': 'error',
			'no-self-assign': 'error',
			'no-self-compare': 'error',
			'no-setter-return': 'error',
			'no-sparse-arrays': 'error',
			'no-template-curly-in-string': 'error',
			'no-this-before-super': 'error',
			'no-unexpected-multiline': 'error',
			'no-unmodified-loop-condition': 'error',
			'no-unreachable': 'error',
			'no-unreachable-loop': 'error',
			'no-unsafe-finally': 'error',
			'no-unsafe-negation': 'error',
			'no-unsafe-optional-chaining': 'error',
			'no-unused-vars': ['error',
				{
					'vars': 'all',
					'args': 'none',
					'varsIgnorePattern': '^[A-Z]+',
				}],
			'no-useless-backreference': 'error',
			'use-isnan': 'error',
			'valid-typeof': 'error',

			// Suggestions
			'accessor-pairs': 'error',
			'arrow-body-style': 'error',
			'block-scoped-var': 'error',
			'curly': 'error',
			'default-case-last': 'error',
			'default-param-last': 'error',
			'eqeqeq': 'error',
			'func-style': ['error',
				'declaration',
				{
					'allowArrowFunctions': true,
				}],
			'grouped-accessor-pairs': 'error',
			'guard-for-in': 'error',
			'max-depth': 'error',
			'max-nested-callbacks': 'error',
			'max-params': ['error',
				4],
			'no-alert': 'error',
			'no-array-constructor': 'error',
			'no-caller': 'error',
			'no-case-declarations': 'error',
			'no-delete-var': 'error',
			'no-div-regex': 'error',
			'no-else-return': 'error',
			'no-extend-native': 'error',
			'no-extra-bind': 'error',
			'no-extra-boolean-cast': 'error',
			'no-extra-label': 'error',
			'no-global-assign': 'error',
			'no-implicit-coercion': ['error',
				{
					'boolean': false,
					'number': true,
					'string': true,
				}],
			'no-implicit-globals': 'error',
			'no-implied-eval': 'error',
			'no-invalid-this': 'error',
			'no-iterator': 'error',
			'no-label-var': 'error',
			'no-labels': 'error',
			'no-lonely-if': 'error',
			'no-loop-func': 'error',
			'no-multi-str': 'error',
			'no-new': 'error',
			'no-new-func': 'error',
			'no-new-object': 'error',
			'no-new-wrappers': 'error',
			'no-nonoctal-decimal-escape': 'error',
			'no-octal': 'error',
			'no-octal-escape': 'error',
			'no-proto': 'error',
			'no-redeclare': 'error',
			'no-regex-spaces': 'error',
			'no-restricted-imports': ['error',
				{
					'patterns': [
						'@ispring/*/*',
						'**/index',
						'**/index.*',
					],
				}],
			'no-return-assign': 'error',
			'no-script-url': 'error',
			'no-sequences': 'error',
			'no-shadow': ['error',
				{
					'hoist': 'never',
				}],
			'no-shadow-restricted-names': 'error',
			'no-throw-literal': 'error',
			'no-unneeded-ternary': 'error',
			'no-unused-expressions': ['error',
				{
					'allowShortCircuit': true,
				}],
			'no-unused-labels': 'error',
			'no-useless-call': 'error',
			'no-useless-computed-key': 'error',
			'no-useless-concat': 'error',
			'no-useless-constructor': 'off',
			'no-useless-escape': 'error',
			'no-useless-rename': 'error',
			'no-useless-return': 'error',
			'no-var': 'error',
			'no-void': 'error',
			'no-with': 'error',
			'object-shorthand': ['error',
				'properties',
				{
					'avoidQuotes': true,
				}],
			'one-var': 'off',
			'operator-assignment': 'error',
			'prefer-arrow-callback': 'error',
			'prefer-const': ['error',
				{
					'destructuring': 'all',
				}],
			'prefer-destructuring': ['error',
				{
					'array': false,
					'object': false,
				}],
			'prefer-exponentiation-operator': 'error',
			'prefer-numeric-literals': 'error',
			'prefer-object-spread': 'error',
			'prefer-regex-literals': 'error',
			'prefer-rest-params': 'error',
			'prefer-spread': 'error',
			'radix': ['error',
				'always'],
			'require-yield': 'error',
			'symbol-description': 'error',
			'yoda': ['error',
				'never',
				{
					'exceptRange': true,
				}],

			// Layout & Formatting
			'unicode-bom': ['error',
				'never'],
		},
	},
	{
		// Formatting
		// https://eslint.style/packages/default
		plugins: {
			'@stylistic': stylisticPlugin,
		},
		rules: {
			'@stylistic/array-bracket-newline': ['error',
				'consistent'],
			'@stylistic/array-bracket-spacing': ['error',
				'never'],
			'@stylistic/array-element-newline': ['error',
				'consistent'],
			'@stylistic/arrow-parens': ['error',
				'as-needed'],
			'@stylistic/arrow-spacing': ['error',
				{
					'after': true,
					'before': true,
				}],
			'@stylistic/block-spacing': ['error',
				'never'],
			'@stylistic/brace-style': ['error',
				'stroustrup',
				{
					'allowSingleLine': false,
				}],
			'@stylistic/comma-dangle': ['error',
				'always-multiline'],
			'@stylistic/comma-spacing': ['error',
				{
					'before': false,
					'after': true,
				}],
			'@stylistic/comma-style': ['error',
				'last'],
			'@stylistic/computed-property-spacing': ['error',
				'never'],
			'@stylistic/dot-location': ['error',
				'property'],
			'@stylistic/eol-last': ['error',
				'always'],
			'@stylistic/func-call-spacing': ['error',
				'never'],
			'@stylistic/generator-star-spacing': 'error',
			'@stylistic/indent': ['error',
				'tab',
				{
					'ignoredNodes': [
						'TemplateLiteral *',
					],
					'SwitchCase': 1,
				}],
			'@stylistic/jsx-quotes': 'error',
			'@stylistic/key-spacing': 'error',
			'@stylistic/keyword-spacing': 'error',
			// @see max-len
			'@stylistic/max-len': ['error',
				{
					'code': 120,
					'ignoreUrls': true,
					'ignoreStrings': true,
					'ignoreTemplateLiterals': true,
					'ignoreRegExpLiterals': true,
				}],
			'@stylistic/max-statements-per-line': 'error',
			'@stylistic/multiline-ternary': 'error',
			'@stylistic/new-parens': ['error',
				'always'],
			'@stylistic/newline-per-chained-call': 'error',
			'@stylistic/no-extra-semi': 'error',
			'@stylistic/no-floating-decimal': 'error',
			'@stylistic/no-mixed-operators': ['error',
				{
					'groups': [
						[
							'&',
							'|',
							'^',
							'~',
							'<<',
							'>>',
							'>>>',
						],
						[
							'==',
							'!=',
							'===',
							'!==',
							'>',
							'>=',
							'<',
							'<=',
						],
						[
							'&&',
							'||',
						],
						[
							'in',
							'instanceof',
						],
					],
				}],
			'@stylistic/no-mixed-spaces-and-tabs': 'error',
			'@stylistic/no-multi-spaces': ['error',
				{
					'ignoreEOLComments': true,
				}],
			'@stylistic/no-multiple-empty-lines': 'error',
			'@stylistic/no-trailing-spaces': 'error',
			'@stylistic/no-whitespace-before-property': 'error',
			'@stylistic/object-curly-newline': ['error',
				{
					'multiline': true,
					'consistent': true,
					'minProperties': 3,
				}],
			'@stylistic/object-curly-spacing': 'error',
			'@stylistic/object-property-newline': ['error'],
			'@stylistic/one-var-declaration-per-line': ['error',
				'initializations'],
			'@stylistic/operator-linebreak': ['error',
				'before'],
			'@stylistic/quotes': ['error',
				'single',
				{
					'allowTemplateLiterals': true,
				}],
			'@stylistic/rest-spread-spacing': 'error',
			'@stylistic/semi': ['error',
				'never'],
			'@stylistic/semi-spacing': ['error',
				{
					'after': true,
					'before': false,
				}],
			'@stylistic/space-before-blocks': 'error',
			'@stylistic/space-before-function-paren': ['error',
				{
					'anonymous': 'never',
					'named': 'never',
					'asyncArrow': 'always',
				}],
			'@stylistic/space-in-parens': ['error',
				'never'],
			'@stylistic/space-infix-ops': 'error',
			'@stylistic/space-unary-ops': 'error',
			'@stylistic/spaced-comment': ['error',
				'always'],
			'@stylistic/switch-colon-spacing': 'error',
			'@stylistic/template-curly-spacing': ['error',
				'never'],
			'@stylistic/template-tag-spacing': ['error',
				'never'],
			'@stylistic/yield-star-spacing': 'error',
		},
	},
	{
		plugins: {
			'import': importPlugin,
		},
		rules: {
			'import/consistent-type-specifier-style': ['error',
				'prefer-inline'],
			'import/export': 'error',
			'import/exports-last': 'error',
			'import/group-exports': 'error',
			'import/newline-after-import': 'error',
			'import/no-absolute-path': 'error',
			'import/no-duplicates': ['error',
				{
					'prefer-inline': true,
				}],
			'import/no-extraneous-dependencies': 'error',
			'import/no-relative-packages': 'error',
			'import/order': ['error',
				{
					'newlines-between': 'never',
					'alphabetize': {
						'order': 'asc',
						'caseInsensitive': true,
					},
					'named': {
						'import': true,
						'types': 'types-first',
					},
					'warnOnUnassignedImports': true,
				}],
		},
	},
	{
		plugins: {
			'import-newlines': fixupPluginRules(importNewLinesPlugin),
		},
		rules: {
			'import-newlines/enforce': ['error',
				{
					'items': 2,
					// @see max-len
					'max-len': 120,
				}],
		},
	},
	{
		files: [
			'**/*.ts',
			'**/*.tsx',
			'**/*.jsx',
		],
		plugins: {
			'@typescript-eslint': tseslintPlugin,
			'@stylistic': stylisticPlugin,
		},
		languageOptions: {
			parser: tseslintParser,
		},
		// https://typescript-eslint.io/rules/
		rules: {
			// Typescript-specific rules
			// -------------------------
			'@typescript-eslint/adjacent-overload-signatures': 'error',
			'@typescript-eslint/array-type': ['error',
				{
					'default': 'array',
				}],
			'@typescript-eslint/ban-ts-comment': 'error',
			'@typescript-eslint/consistent-generic-constructors': ['error',
				'constructor'],
			'@typescript-eslint/consistent-type-assertions': ['error',
				{
					'assertionStyle': 'as',
				}],
			'@typescript-eslint/consistent-type-definitions': ['error',
				'interface'],
			'@typescript-eslint/consistent-type-imports': ['error',
				{
					'fixStyle': 'inline-type-imports',
					'prefer': 'type-imports',
				}],
			'@typescript-eslint/explicit-member-accessibility': ['error',
				{
					'accessibility': 'no-public',
				}],

			'@typescript-eslint/member-ordering': 'off',
			'@typescript-eslint/method-signature-style': ['error',
				'property'],
			'@typescript-eslint/naming-convention': [
				'error',
				{
					'selector': 'objectLiteralMethod',
					'format': null,
				},
				{
					'selector': 'objectLiteralProperty',
					'format': null,
				},
				{
					'selector': ['enum',
						'typeParameter'],
					'format': ['UPPER_CASE'],
					'leadingUnderscore': 'allow',
				},
				{
					'selector': 'enumMember',
					'format': ['camelCase'],
					'leadingUnderscore': 'allow',
				},
				{
					'selector': 'parameter',
					'format': ['camelCase'],
					'leadingUnderscore': 'allow',
				},
				{
					'selector': 'typeLike',
					'format': ['PascalCase'],
					'leadingUnderscore': 'allow',
				},
				{
					'selector': 'method',
					'format': ['camelCase'],
					'leadingUnderscore': 'allow',
				},
			],
			'@typescript-eslint/no-duplicate-enum-values': 'error',
			'@typescript-eslint/no-extraneous-class': 'error',
			'@typescript-eslint/no-inferrable-types': ['error',
				{
					'ignoreParameters': true,
				}],
			'@typescript-eslint/no-misused-new': 'error',
			'@typescript-eslint/no-namespace': 'error',
			'@typescript-eslint/no-require-imports': 'error',
			'@typescript-eslint/prefer-as-const': 'error',
			'@typescript-eslint/prefer-function-type': 'error',
			'@typescript-eslint/prefer-optional-chain': 'off',
			'@typescript-eslint/prefer-ts-expect-error': 'error',
			'@typescript-eslint/unified-signatures': 'error',

			// Extension Rules
			// ---------------

			'@stylistic/type-annotation-spacing': ['error',
				{
					'before': false,
					'after': true,
					'overrides': {
						'arrow': {
							'before': true,
							'after': true,
						},
					},
				}],
			'@stylistic/member-delimiter-style': ['error',
				{
					'multiline': {
						'delimiter': 'comma',
						'requireLast': true,
					},
					'singleline': {
						'delimiter': 'comma',
						'requireLast': false,
					},
				}],
			'@stylistic/brace-style': ['error',
				'stroustrup'],

			'default-param-last': 'off',
			'@typescript-eslint/default-param-last': 'error',

			'no-array-constructor': 'off',
			'@typescript-eslint/no-array-constructor': 'error',

			'no-dupe-class-members': 'off',
			'@typescript-eslint/no-dupe-class-members': 'error',

			'no-invalid-this': 'off',
			'@typescript-eslint/no-invalid-this': 'error',

			'no-loop-func': 'off',
			'@typescript-eslint/no-loop-func': 'error',

			'no-redeclare': 'off',
			'@typescript-eslint/no-redeclare': 'error',

			'no-restricted-imports': 'off',
			'@typescript-eslint/no-restricted-imports': ['error',
				{
					'patterns': [
						'@ispring/*/*',
						'**/index',
						'**/index.*',
					],
				}],

			'no-shadow': 'off',
			'@typescript-eslint/no-shadow': ['error',
				{
					'hoist': 'never',
				}],

			'no-unused-expressions': 'off',
			'@typescript-eslint/no-unused-expressions': ['error',
				{
					'allowShortCircuit': true,
				}],

			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': ['error',
				{
					'vars': 'all',
					'args': 'none',
					'varsIgnorePattern': '^[A-Z]+',
				}],

			'no-useless-constructor': 'off',
			'@typescript-eslint/no-useless-constructor': 'error',
		},
	},
	{
		files: [
			'packages/*/src/index.ts',
		],
		plugins: {
			'@typescript-eslint': tseslintPlugin,
			'sort-exports': fixupPluginRules(sortExportPlugin),
		},
		languageOptions: {
			parser: tseslintParser,
		},
		rules: {
			'sort-exports/sort-exports': ['error',
				{
					'sortDir': 'asc',
					'ignoreCase': true,
					'sortExportKindFirst': 'type',
				}],
		},
	},

	...eslintPluginYml.configs['flat/recommended'],
	...eslintPluginJsonc.configs['flat/recommended-with-jsonc'],
	{
		files: [
			'**/*.json',
			'**/*.yaml',
			'**/*.yml',
		],
		plugins: {
			'jsonc': eslintPluginJsonc,
			'yml': eslintPluginYml,
		},
		rules: {
			'no-irregular-whitespace': 'off',
			'yml/indent': ['error',
				2],
			'jsonc/indent': ['error',
				2],
			'jsonc/no-useless-escape': 'off',
			'jsonc/key-spacing': 'off',
			'jsonc/array-element-newline': 'off',
			'jsonc/object-property-newline': 'off',
			'jsonc/key-name-casing': 'off',
		},
	},
]
