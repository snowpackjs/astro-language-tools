# @astrojs/ts-plugin

## 1.6.1

### Patch Changes

- 9ca368b: Update to the latest version of Volar. This release should fix some of the caching issues that has crept up recently

## 1.6.0

### Minor Changes

- 85b42dc: Update to the latest version of Volar. This release fixes a few issues such as missing Prettier crashing the language server in some cases, resolutions not working correctly inside TSX files, and more.

## 1.5.3

### Patch Changes

- 7c4c1f2: Update Volar services. This update fixes an issue where `typescript.validate` settings wouldn't work in Astro files the same way they would inside TypeScript files

## 1.5.2

### Patch Changes

- 6924c7e: Fixes semantic highlighting not working inside .ts(x) files in certain cases
- 310fbfe: Fix Svelte and Vue integrations not working on Windows in certain cases

## 1.5.1

### Patch Changes

- de58706: Fix imports from certain packages not working correctly in certain cases

## 1.5.0

### Minor Changes

- 15a5532: Upgrade to Volar 2.0. No regressions are currently expected, however as this is a fairly consequential backend change, please report any issues you encounter.

  For reference, Volar is the underlying framework that powers the Astro language server, you can think of it as Vite for editor tooling.

## 1.4.0

### Minor Changes

- dab6801: Enables more accurate types when using JSX-based frameworks. This internal refactor to Astro's JSX types will be an invisible change for most users, but fixes a number of type checking problems for users of other JSX frameworks.

## 1.3.1

### Patch Changes

- ee41dce: Add support for TypeScript 5.3
- 19217c4: Automatically flatten inferred unions from `getStaticPaths` into each other so that divergent props don't need to be manually discriminated before destructuring.

## 1.3.0

### Minor Changes

- f4402eb: Add intellisense for Astro.self, add auto inferring of props for `getStaticPaths`

## 1.2.0

### Minor Changes

- 9381e1d: Update dependencies

## 1.1.3

### Patch Changes

- 4e10283: Fix TSServer crash, for real this time

## 1.1.2

### Patch Changes

- 4b510dd: Fix TSServer crashing in certain situations

## 1.1.1

### Patch Changes

- 65fca95: Update Volar to latest version. This fixes resolving Astro files from `node_modules` and various other import errors.

## 1.1.0

### Minor Changes

- f9b2aea: The Astro TypeScript plugin is now powered by Volar! Much like our Volar-powered language server, this brings many improvement in stability, performance and in the future, will allow us to add more features to it much more easily than before.

### Patch Changes

- 1202c9d: Upgraded dependencies, added support for Prettier 3

## 1.0.10

### Patch Changes

- 60e4ce0: Fix packaging error causing TypeScript plugin to not work

## 1.0.9

### Patch Changes

- b6a98e0: Better handle when the Astro compiler fails to parse a file

## 1.0.8

### Patch Changes

- 170a193: Update dependencies

## 1.0.7

### Patch Changes

- c6cf1d7: Update Prettier plugin version

## 1.0.6

### Patch Changes

- 3fcbc1a: Fix TypeScript plugin crashing at start in certain circumstances

## 1.0.5

### Patch Changes

- ae15420: Fix importing `.astro` files in `.ts` files not working with TypeScript 5.0+

## 1.0.4

### Patch Changes

- eaefe96: Fix packaging error

## 1.0.3

### Patch Changes

- 685513b: Improve stability related to converting files to TSX

## 1.0.0

### Major Changes

- 39a7669: 1.0! This release includes no new changes by itself, but symbolize the official release of what was previously the pre-release version of the extension. For changelogs, please refer to the changelog from `0.29.0` to now.

## 0.4.5

### Patch Changes

- 8ff8bdf: Update compiler version to fix Windows mapping issue

## 0.4.4

### Patch Changes

- c04adf3: Upgrade compiler version to 1.1.1

## 0.4.3

### Patch Changes

- 6b81412: Added an explanation on how to generate types for content collections to the error message for the `astro:content` import

## 0.4.2

### Patch Changes

- 94a9b61: Add proper support for renaming symbols inside Astro (.astro) files

## 0.4.1

### Patch Changes

- 985515d: Update `@astrojs/compiler`, fixing a few bugs

## 0.4.0

### Minor Changes

- c8cdef9: Improved support for `.astro` imports inside JavaScript/TypeScript files:
  - Added support for finding file references inside Astro files
  - Added support for path completions for .astro, .md and .mdx files
  - Fixed cases where our TypeScript plugin would fail to load under certain circumstance
  - Fixed certain cases where Go to definition / implementation would fail

## 0.3.0

### Minor Changes

- b66ae70: Update the VS Code extension to use a bundled version of the language server for better performance and compatibility with running the extension in the web

## 0.2.1

### Patch Changes

- d056cd5: Fixes production bugs in extension

## 0.2.0

### Minor Changes

- 6b6b47a: Remove internal astro.d.ts files, instead prefer the one provided by Astro itself

## 0.1.1

### Patch Changes

- f1f3091: Fix commenting, namespaced elements, and Fragment typings
