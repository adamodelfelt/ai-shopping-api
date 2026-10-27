import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { packageExtension } from './package-extension.js';
await packageExtension();
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
for (const name of await readdir(new URL('../public/', import.meta.url))) await copyFile(new URL(`../public/${name}`, import.meta.url), new URL(`../dist/${name}`, import.meta.url));
console.log('Built static frontend. No credentials or catalogue data are bundled into dist.');
