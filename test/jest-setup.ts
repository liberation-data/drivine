/**
 * Setup scripts, runs before each test file
 */

/**
 * change LOG_LEVEL for the tests
 * comment it if you need drivine logs for debugging
 */
import { Logger } from '@nestjs/common';
Logger.overrideLogger(['error']);
