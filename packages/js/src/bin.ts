#!/usr/bin/env node
import { fail, run, ShaqsiyadError } from './cli.js';

run(process.argv.slice(2)).catch((e: unknown) => {
  const err = e as Error;
  fail(err instanceof ShaqsiyadError && err.status ? `${err.status} ${err.message}` : err.message);
});
