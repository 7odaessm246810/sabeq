/* eslint-disable no-console -- a CLI check: output is for the person at the terminal */
// Consistency check for the catalog data files (run with tsx).
import { CUTOFFS_2026 } from './cutoffs-2026.js';
import { PUBLIC_DEPARTMENTS } from './departments.js';
import { KINDS } from './kinds.js';
import { PUBLIC_FACULTIES } from './public-faculties.js';
import { AZHAR_FACULTIES, GOVERNORATE_OF } from './azhar-faculties.js';
import { ALL_UNIVERSITIES } from './universities.js';

const kinds = new Map(KINDS.map((k) => [k.slug, k]));
const problems: string[] = [];
const names = new Map<string, Set<string>>();
for (const [u, { faculties }] of Object.entries(PUBLIC_FACULTIES)) {
  if (!ALL_UNIVERSITIES.some((x) => x.slug === u)) problems.push(`unknown university ${u}`);
  const set = new Set<string>();
  for (const [k, n] of faculties) {
    const kind = kinds.get(k);
    if (!kind) problems.push(`${u}: unknown kind ${k}`);
    const name = n ?? kind?.fullNameAr ?? k;
    if (set.has(name)) problems.push(`${u}: duplicate ${name}`);
    set.add(name);
  }
  names.set(u, set);
}
for (const f of AZHAR_FACULTIES)
  if (!kinds.has(f.kind)) problems.push(`azhar: unknown kind ${f.kind}`);
const az = new Set(AZHAR_FACULTIES.map((f) => f.nameAr));
if (az.size !== AZHAR_FACULTIES.length) problems.push('azhar: duplicate names');
for (const [u, f] of CUTOFFS_2026) {
  const name = kinds.get(f)?.fullNameAr ?? f;
  const want = PUBLIC_FACULTIES[u]?.faculties.map(([k, n]) => n ?? kinds.get(k)?.fullNameAr);
  const ok =
    want?.includes(name) ||
    PUBLIC_FACULTIES[u]?.faculties.some(([k, n]) => k === f && !n) ||
    PUBLIC_FACULTIES[u]?.faculties.filter(([k]) => k === f).length === 1;
  if (!ok) problems.push(`cutoff ${u}/${f} has no matching faculty`);
}
for (const f of AZHAR_FACULTIES)
  if (f.city !== 'القاهرة' && !GOVERNORATE_OF[f.city])
    problems.push(`azhar: no governorate for ${f.city}`);
let departments = 0;
for (const [key, { source, departments: names }] of Object.entries(PUBLIC_DEPARTMENTS)) {
  const [u = '', name] = key.split('|');
  const want = PUBLIC_FACULTIES[u]?.faculties.map(([k, n]) => n ?? kinds.get(k)?.fullNameAr);
  if (!want?.includes(name)) problems.push(`departments ${key} has no matching faculty`);
  if (!source.startsWith('https://')) problems.push(`departments ${key} has no source`);
  if (new Set(names).size !== names.length) problems.push(`departments ${key} has duplicates`);
  for (const d of names)
    if (d.length < 3 || d.length > 120 || /[=[]{}|]/.test(d))
      problems.push(`department ${key}: "${d}"`);
  departments += names.length;
}
const total = Object.values(PUBLIC_FACULTIES).reduce((n, x) => n + x.faculties.length, 0);
console.log(
  `kinds ${KINDS.length}, universities ${ALL_UNIVERSITIES.length}, public faculties ${total}, azhar ${AZHAR_FACULTIES.length}, cutoffs ${CUTOFFS_2026.length}, departments ${departments} in ${Object.keys(PUBLIC_DEPARTMENTS).length} faculties`,
);
console.log(problems.length ? problems.join('\n') : 'no problems');
