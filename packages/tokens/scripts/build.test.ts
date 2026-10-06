import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { toCss, type TokensFile } from './generate.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = JSON.parse(readFileSync(join(root, 'src/tokens.json'), 'utf8')) as TokensFile;
const css = toCss(file);

test('uses light values only', () => {
  assert.match(css, /--primary: #0f6b5a;/);
  assert.match(css, /--bg: #f7f5f0;/);
  assert.doesNotMatch(css, /#4fbfa4/); // dark primary
});

test('emits every family the stylesheet relies on', () => {
  for (const name of [
    'space-10',
    'radius-pill',
    'shadow-3',
    'nav-height',
    'dur-path',
    'ease-out',
    'z-toast',
    'font-display',
    'font-mono',
  ]) {
    assert.match(css, new RegExp(`--${name}: `), name);
  }
});

test('rejects duplicate names', () => {
  const dup = structuredClone(file);
  dup.color.tokens?.push({ name: 'primary', value: '#000' });
  assert.throws(() => toCss(dup), /Duplicate/);
});
