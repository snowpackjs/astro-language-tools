module.exports = {
	parser: '@typescript-eslint/parser',
	extends: ['plugin:@typescript-eslint/recommended'],
	plugins: ['@typescript-eslint'],
	rules: {
		'@typescript-eslint/ban-ts-comment': 'off',
		'@typescript-eslint/camelcase': 'off',
		'@typescript-eslint/explicit-module-boundary-types': 'off',
		'@typescript-eslint/no-empty-function': 'off',
		'@typescript-eslint/no-explicit-any': 'off',
		'@typescript-eslint/no-non-null-assertion': 'off',
		'@typescript-eslint/no-unused-vars': 'off',
		'@typescript-eslint/no-use-before-define': 'off',
		'@typescript-eslint/no-var-requires': 'off',
		'@typescript-eslint/no-this-alias': 'off',
		'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
		'no-shadow': 'off',
		'@typescript-eslint/no-shadow': ['error'],
		'prefer-const': 'off',
		// 'require-jsdoc': 'error', // re-enable this to enforce JSDoc for all functions
	},
	overrides: [
		{
			files: ['**/scripts/**', '**/bin/**'],
			rules: {
				'no-console': 'off',
			},
		},
	],
};
