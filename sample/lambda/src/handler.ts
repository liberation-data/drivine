import { hiringApp } from './HiringApp';

/**
 * The Lambda's entry point, over the database DATABASE_* configures. It is made when the module loads, so each cold
 * start connects once and the warm invocations after it reuse the pool.
 */
export const handler = hiringApp();
