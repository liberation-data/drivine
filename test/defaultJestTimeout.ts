//
// This file is used to override the default per-test timeout
// of 5000ms.
//
const timeout = parseInt(process.env.JEST_TIMEOUT || '30000');
jest.setTimeout(timeout);
