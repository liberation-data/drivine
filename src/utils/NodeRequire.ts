/**
 * Loads the module `name` in Node, on first use. Its name is a parameter, so a bundler building Drivine for a page
 * doesn't follow it: a page never reaches the code that asks for it (node:sqlite, a cursor's stream), or is given what
 * it would load (see useSqliteDriver and useCypherCompiler).
 */
export function nodeRequire<T = any>(name: string): T {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(name);
}
