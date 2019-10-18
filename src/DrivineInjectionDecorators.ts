import { Inject } from '@nestjs/common';

export const InjectConnectionProvider = (): any => {
    return Inject(`ConnectionProvider`);
};

export const fileContentInjections: string[] = [];

export const InjectFileContents = (path: string): any => {
    const filename = require.resolve(path);
    if (!fileContentInjections.includes(filename)) {
        fileContentInjections.push(filename);
    }
    return Inject(`FileContents:${filename}`);
};

export const InjectCypher = (path: string): any => {
    return InjectFileContents(`${path}.cypher`);
};
