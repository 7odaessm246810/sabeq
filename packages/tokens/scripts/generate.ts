/**
 * Turns the design handoff `tokens.json` into CSS custom properties.
 * Light theme only (ADR-0012): every themed value takes its `light` entry.
 */

interface Token {
  name: string;
  value: string | Record<string, string>;
}

interface Family {
  tokens?: Token[];
}

export interface TokensFile {
  name: string;
  color: Family & { themes: { id: string }[] };
  type: { families: Record<string, string> };
  [family: string]: unknown;
}

const THEME = 'light';

/** Families emitted as variables, in output order. `type` is handled separately. */
const FAMILIES = ['color', 'spacing', 'radius', 'shadow', 'layout', 'duration', 'easing', 'zIndex'];

function resolve(token: Token): string {
  if (typeof token.value === 'string') return token.value;
  const value = token.value[THEME];
  if (value === undefined) throw new Error(`Token "${token.name}" has no ${THEME} value`);
  return value;
}

export function toCss(file: TokensFile): string {
  const lines: string[] = [];
  const seen = new Set<string>();

  const add = (name: string, value: string) => {
    if (seen.has(name)) throw new Error(`Duplicate token name "${name}"`);
    seen.add(name);
    lines.push(`  --${name}: ${value};`);
  };

  for (const family of FAMILIES) {
    const group = file[family] as Family | undefined;
    if (!group?.tokens) continue;
    lines.push(`  /* ${family} */`);
    for (const token of group.tokens) add(token.name, resolve(token));
  }

  lines.push('  /* type */');
  for (const [name, stack] of Object.entries(file.type.families)) add(`font-${name}`, stack);

  return [
    '/* GENERATED from src/tokens.json by scripts/build.ts — do not edit. */',
    '@layer tokens {',
    ':root {',
    ...lines,
    '}',
    '}',
    '',
  ].join('\n');
}
