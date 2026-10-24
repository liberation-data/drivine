#!/usr/bin/env node
import { main } from '@/codegen/command';

try {
    process.exitCode = main(process.argv.slice(2));
} catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
}
