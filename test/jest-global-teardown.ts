/**
 * Runs once after every test file: stops the test containers the global setup started.
 */
require('tsconfig-paths/register');
import { drivineGlobalTeardown } from '../src/testing';

module.exports = drivineGlobalTeardown;
