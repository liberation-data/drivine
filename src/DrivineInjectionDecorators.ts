import { Inject } from '@nestjs/common';
import { join } from 'path';

export const persistenceManagerInjections: string[] = [];
export const InjectPersistenceManager = (database: string = 'default'): any => {
    if (!persistenceManagerInjections.includes(database)) {
        persistenceManagerInjections.push(database);
    }
    return Inject(`PersistenceManager:${database}`);
};

export const fileContentInjections: string[] = [];
export const InjectFileContents = (dirNameOrPath: string, resource?: string): any => {
    const filename = fileNameFor(dirNameOrPath, undefined, resource);
    if (!fileContentInjections.includes(filename)) {
        fileContentInjections.push(filename);
    }
    return Inject(`FileContents:${filename}`);
};

export const cypherInjections: string[] = [];
export const InjectCypher = (dirNameOrPath: string, resource?: string): any => {
    const filename = fileNameFor(dirNameOrPath, 'cypher', resource);
    if (!cypherInjections.includes(filename)) {
        cypherInjections.push(filename);
    }
    return Inject(`CYPHER:${filename}`);
};

export const sqlInjections: string[] = [];
export const InjectSql = (dirNameOrPath: string, resource?: string): any => {
    const filename = fileNameFor(dirNameOrPath, 'sql', resource);
    if (!sqlInjections.includes(filename)) {
        sqlInjections.push(filename);
    }
    return Inject(`SQL:${filename}`);
};

/**
 * Resolves a resource name given the arguments. The single argument version is for use when a TypeScript path alias
 * is set up. Example @Inject('@/traffic/routesBetween'). This is the original behavior in v1.x, however some users found
 * it puzzling.
 *
 * The two argument version is for when there is not path alias, for example: @Inject(__dirname, 'routesBetween').
 *
 * @param dirNameOrPath Either a directory name or the full path.
 * @param extension The extension of the file, if any.
 * @param resourceName, the file name, given that the dirName is specified as the first argument.
 */
function fileNameFor(dirNameOrPath: string, extension?: string, resourceName?: string): string {
    if (resourceName) {
        const path = join(`${dirNameOrPath}/${resourceName}`);
        return require.resolve(extension ? `${path}.${extension}` : `${path}`);
    } else {
        return require.resolve(extension ? `${dirNameOrPath}.${extension}` : `${dirNameOrPath}`);
    }
}
