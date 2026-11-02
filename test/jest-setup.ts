import * as fs from 'fs';
import * as path from 'path';
/**
 * Setup scripts, runs before each test file
 */

/**
 * change LOG_LEVEL for the tests
 * comment it if you need drivine logs for debugging
 */
import { Logger } from '@nestjs/common';
Logger.overrideLogger(['error']);

/** The folder the SQLite datasource's file is in (SQLITE_DATABASE_NAME in .env.test): SQLite makes a file, not a folder. */
fs.mkdirSync(path.resolve(__dirname, '..', '.sqlite'), { recursive: true });
