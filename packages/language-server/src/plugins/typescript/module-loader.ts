import ts from 'typescript';
import type { DocumentSnapshot } from './snapshots/DocumentSnapshot';
import { isVirtualAstroFilePath, ensureRealAstroFilePath, getExtensionFromScriptKind } from './utils';
import { createAstroSys } from './astro-sys';
import { getLastPartOfPath } from '../../utils';

/**
 * Caches resolved modules.
 */
class ModuleResolutionCache {
	private cache = new Map<string, ts.ResolvedModule | undefined>();

	/**
	 * Tries to get a cached module.
	 */
	get(moduleName: string, containingFile: string): ts.ResolvedModule | undefined {
		return this.cache.get(this.getKey(moduleName, containingFile));
	}

	/**
	 * Checks if has cached module.
	 */
	has(moduleName: string, containingFile: string): boolean {
		return this.cache.has(this.getKey(moduleName, containingFile));
	}

	/**
	 * Caches resolved module (or undefined).
	 */
	set(moduleName: string, containingFile: string, resolvedModule: ts.ResolvedModule | undefined) {
		this.cache.set(this.getKey(moduleName, containingFile), resolvedModule);
	}

	/**
	 * Deletes module from cache. Call this if a file was deleted.
	 * @param resolvedModuleName full path of the module
	 */
	delete(resolvedModuleName: string): void {
		this.cache.forEach((val, key) => {
			if (val?.resolvedFileName === resolvedModuleName) {
				this.cache.delete(key);
			}
		});
	}

	/**
	 * Deletes everything from cache that resolved to `undefined`
	 * and which might match the path.
	 */
	deleteUnresolvedResolutionsFromCache(path: string): void {
		const fileNameWithoutEnding = getLastPartOfPath(path).split('.').shift() || '';
		this.cache.forEach((val, key) => {
			const moduleName = key.split(':::').pop() || '';
			if (!val && moduleName.includes(fileNameWithoutEnding)) {
				this.cache.delete(key);
			}
		});
	}

	private getKey(moduleName: string, containingFile: string) {
		return containingFile + ':::' + ensureRealAstroFilePath(moduleName);
	}
}

/**
 * Creates a module loader specifically for `.astro` files.
 *
 * The typescript language service tries to look up other files that are referenced in the currently open astro file.
 * For `.ts`/`.js` files this works, for `.astro` files it does not by default.
 * Reason: The typescript language service does not know about the `.astro` file ending,
 * so it assumes it's a normal typescript file and searches for files like `../Component.astro.ts`, which is wrong.
 * In order to fix this, we need to wrap typescript's module resolution and reroute all `.astro.ts` file lookups to .astro.
 *
 * @param getSnapshot A function which returns a (in case of astro file fully preprocessed) typescript/javascript snapshot
 * @param compilerOptions The typescript compiler options
 */
export function createAstroModuleLoader(
	getSnapshot: (fileName: string) => DocumentSnapshot,
	compilerOptions: ts.CompilerOptions
) {
	const astroSys = createAstroSys(getSnapshot);
	const moduleCache = new ModuleResolutionCache();

	return {
		fileExists: astroSys.fileExists,
		readFile: astroSys.readFile,
		readDirectory: astroSys.readDirectory,
		deleteFromModuleCache: (path: string) => {
			astroSys.deleteFromCache(path);
			moduleCache.delete(path);
		},
		deleteUnresolvedResolutionsFromCache: (path: string) => {
			astroSys.deleteFromCache(path);
			moduleCache.deleteUnresolvedResolutionsFromCache(path);
		},
		resolveModuleNames,
	};

	function resolveModuleNames(moduleNames: string[], containingFile: string): Array<ts.ResolvedModule | undefined> {
		return moduleNames.map((moduleName) => {
			if (moduleCache.has(moduleName, containingFile)) {
				return moduleCache.get(moduleName, containingFile);
			}

			const resolvedModule = resolveModuleName(moduleName, containingFile);
			moduleCache.set(moduleName, containingFile, resolvedModule);
			return resolvedModule;
		});
	}

	function resolveModuleName(name: string, containingFile: string): ts.ResolvedModule | undefined {
		// Delegate to the TS resolver first.
		// If that does not bring up anything, try the Astro Module loader
		// which is able to deal with .astro files.

		const tsResolvedModule = ts.resolveModuleName(name, containingFile, compilerOptions, ts.sys).resolvedModule;
		if (tsResolvedModule && !isVirtualAstroFilePath(tsResolvedModule.resolvedFileName)) {
			return tsResolvedModule;
		}

		const svelteResolvedModule = ts.resolveModuleName(name, containingFile, compilerOptions, astroSys).resolvedModule;
		if (!svelteResolvedModule || !isVirtualAstroFilePath(svelteResolvedModule.resolvedFileName)) {
			return svelteResolvedModule;
		}

		const resolvedFileName = ensureRealAstroFilePath(svelteResolvedModule.resolvedFileName);
		const snapshot = getSnapshot(resolvedFileName);

		const resolvedSvelteModule: ts.ResolvedModuleFull = {
			extension: getExtensionFromScriptKind(snapshot && snapshot.scriptKind),
			resolvedFileName,
			isExternalLibraryImport: svelteResolvedModule.isExternalLibraryImport,
		};
		return resolvedSvelteModule;
	}
}
