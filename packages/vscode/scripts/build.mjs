// @ts-check
import esbuild from 'esbuild';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { rebuildPlugin } from './shared.mjs';

const require = createRequire(import.meta.url);

export default async function build() {
	const isDev = process.argv.includes('--watch');
	const metaFile = process.argv.includes('--metafile');

	/**
	 * @type {import('esbuild').BuildOptions}
	 */
	const config = {
		entryPoints: {
			'dist/node/client': './src/client.ts',
			'dist/node/server': './node_modules/@astrojs/language-server/bin/nodeServer.js',
			// We need to generate this inside node_modules so VS Code can resolve it
			'node_modules/astro-ts-plugin-bundle/index':
				'./node_modules/@astrojs/ts-plugin/dist/index.js',
		},
		bundle: true,
		metafile: metaFile,
		sourcemap: isDev,
		outdir: '.',
		external: ['vscode', '@astrojs/compiler', 'prettier', 'prettier-plugin-astro'],
		format: 'cjs',
		platform: 'node',
		tsconfig: './tsconfig.json',
		define: { 'process.env.NODE_ENV': '"production"' },
		minify: process.argv.includes('--minify'),
		plugins: [
			{
				name: 'umd2esm',
				setup(pluginBuild) {
					pluginBuild.onResolve(
						{ filter: /^(vscode-.*|estree-walker|jsonc-parser)/ },
						(buildArgs) => {
							const pathUmdMay = require.resolve(buildArgs.path, { paths: [buildArgs.resolveDir] });
							// Call twice the replace is to solve the problem of the path in Windows
							const pathEsm = pathUmdMay.replace('/umd/', '/esm/').replace('\\umd\\', '\\esm\\');
							return { path: pathEsm };
						}
					);
				},
			},
		],
	};

	if (!isDev) {
		const result = await esbuild.build(config);
		if (metaFile) fs.writeFileSync('meta.json', JSON.stringify(result.metafile));
		return;
	}

	const builder = await esbuild.context({
		...config,
		plugins: [rebuildPlugin, ...(config.plugins ?? [])],
	});

	await builder.watch();

	process.on('beforeExit', () => {
		builder.dispose && builder.dispose();
	});
}

build();
