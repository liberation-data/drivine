/**
 * Resolves the '@/' paths outside Jest's module mapping: in its global setup and teardown, and the test runner. Only
 * that alias: the tsconfig's catch-all '*' would send every package's imports to the top-level node_modules, past the
 * versions nested beside the packages that need them.
 */
import * as path from 'path';
import { register } from 'tsconfig-paths';

register({ baseUrl: path.resolve(__dirname, '..'), paths: { '@/*': ['src/*'] } });
