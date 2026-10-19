/**
 * Runs once after every test file: stops the test containers the global setup started.
 */
require('./register-paths');
import { drivineGlobalTeardown } from '../src/testing';

module.exports = drivineGlobalTeardown;
