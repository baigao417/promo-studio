// Register node:test suites in one process, including in restricted environments.
import { readdir } from 'node:fs/promises';

const directory = new URL('./', import.meta.url);
for (const name of (await readdir(directory)).filter((name) => name.endsWith('.test.mjs')).sort()) {
  await import(new URL(name, directory));
}
