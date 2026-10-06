import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toCss, type TokensFile } from './generate.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = JSON.parse(readFileSync(join(root, 'src/tokens.json'), 'utf8')) as TokensFile;

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/tokens.css'), toCss(file));
