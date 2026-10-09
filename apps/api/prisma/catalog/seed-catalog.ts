/**
 * Loads the researched catalog (Phase 11) into the database. Idempotent; safe on every environment.
 *
 * - Universities: every recognised institution (catalog/universities.ts). Renamed ones keep their id.
 * - Faculties: public universities and Al-Azhar from researched lists; private / ahliya /
 *   international faculties from NAQAAE decisions (official evidence that they exist).
 *   Faculties of researched universities that are not in the lists are hidden, never deleted —
 *   mentors and applications may reference them.
 * - Accreditation: NAQAAE institutional status + accredited programmes per faculty.
 * - Departments: public faculties that have a Wikipedia article listing them (catalog/departments.ts).
 * - Cutoffs: Tansik 2026 phase 1.
 * - Prototype placeholders (generic departments, invented "graduate" quotes) are hidden.
 * - Rows an admin created or edited (`adminEditedAt`) belong to the admin: never updated, hidden or
 *   re-used here. The research only fills what nobody curated by hand.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from 'pino';
import { Prisma } from '../../src/generated/prisma/client.js';
import type { Db } from '../../src/infra/db.js';
import { AZHAR_FACULTIES, AZHAR_SOURCES } from './azhar-faculties.js';
import { CUTOFFS_2026, CUTOFFS_2026_SOURCE } from './cutoffs-2026.js';
import { PUBLIC_DEPARTMENTS } from './departments.js';
import { KINDS } from './kinds.js';
import { NAQAAE_SOURCE, PUBLIC_FACULTIES } from './public-faculties.js';
import { ALL_UNIVERSITIES, UNIVERSITY_LIST_SOURCE } from './universities.js';

const NAQAAE_FILE = 'naqaae-2026-10-09.json';
const VERIFIED_AT = new Date('2026-10-09');

interface NaqaaeFaculty {
  university: string;
  faculty: string;
  accreditation:
    | { status: 'accredited' | 'conditional'; decidedAt: string; expiresAt: string }
    | { status: 'none'; lastDecision: string; decidedAt: string }
    | null;
  programmes: { name: string; status: string; expiresAt: string }[];
}

/** NAQAAE's spellings of university names → our slugs. Unlisted bodies (ministries, institutes) are skipped. */
const NAQAAE_UNIVERSITY: Record<string, string> = {
  'جامعة القاهرة': 'cairo',
  'جامعة الاسكندرية': 'alexandria',
  'جامعة عين شمس': 'ain-shams',
  'جامعة أسيوط': 'assiut',
  'جامعة طنطا': 'tanta',
  'جامعة المنصورة': 'mansoura',
  'جامعة الزقازيق': 'zagazig',
  'جامعة العاصمة': 'capital',
  'جامعة المنيا': 'minia',
  'جامعة المنوفية': 'menoufia',
  'جامعة قناة السويس': 'suez-canal',
  'جامعة جنوب الوادي': 'qena',
  'جامعة بني سويف': 'beni-suef',
  'جامعة الفيوم': 'fayoum',
  'جامعة بنها': 'benha',
  'جامعة كفر الشيخ': 'kafrelsheikh',
  'جامعة سوهاج': 'sohag',
  'جامعة بورسعيد': 'port-said',
  'جامعة دمنهور': 'damanhour',
  'جامعة أسوان': 'aswan',
  'جامعة دمياط': 'damietta',
  'جامعة السويس': 'suez',
  'جامعة مدينة السادات': 'sadat-city',
  'جامعة الوادي الجديد': 'new-valley',
  'جامعة الأزهر': 'azhar',
  'الأكاديمية العربية للعلوم والتكنولوجيا والنقل البحري': 'aast',
  'الجامعة الألمانية بالقاهرة': 'guc',
  'الجامعة الأمريكية': 'auc',
  'الجامعة البريطانية': 'bue',
  'الجامعة الحديثة للتكنولوجيا والمعلومات': 'mti',
  'الجامعة المصرية الروسية': 'eru',
  'الجامعة المصرية الصينية': 'ecu',
  'الجامعة المصرية للتعلم الإلكتروني الأهلية': 'eelu',
  'العلمين الدولية': 'aiu',
  'جامعة 6 أكتوبر': 'october-6',
  'جامعة أكتوبر للعلوم الحديثة والآداب': 'msa',
  'جامعة الأهرام الكندية': 'acu',
  'جامعة الجيزة الجديدة': 'ngu',
  'جامعة الدلتا للعلوم والتكنولوجيا': 'deltauniv',
  'جامعة المستقبل': 'fue',
  'جامعة النهضة': 'nahda',
  'جامعة النيل الاهلية': 'nu',
  'جامعة بدر بالقاهرة': 'badr',
  'جامعة حورس': 'horus',
  'جامعة دراية': 'deraya',
  'جامعة سيناء': 'sinai',
  'جامعة فاروس': 'pharos',
  'جامعة مصر الدولية': 'miu',
  'جامعة مصر للعلوم والتكنولوجيا': 'must',
  'جامعة هليوبوليس': 'heliopolis',
};

/** Faculty name → kind. Order matters: specific names before general ones. */
const KIND_RULES: [RegExp, string][] = [
  [/طب الفم|طب الاسنان|طب الأسنان|طب وجراحة الفم|الاسنان|الأسنان/, 'dent'],
  [/البيطر/, 'vet'],
  [/العلاج الطبيعي|العلاج الطبيعى/, 'pt'],
  [/الصيدل/, 'pharm'],
  [/التمريض/, 'nursing'],
  [/العلوم الطبية التطبيقية/, 'applied-med'],
  [/العلوم الصحية/, 'health-sci'],
  [/علوم التغذية/, 'nutrition'],
  [/هندسة البترول|البترول والتعدين/, 'eng-petroleum'],
  [/الهندسة الإلكترونية|الهندسة الالكترونية/, 'eng-electronic'],
  [/هندسة الطاقة/, 'eng-energy'],
  [/الهندسة الزراعية/, 'agri-eng'],
  [/التخطيط/, 'planning'],
  [/الهندسة|هندسة/, 'eng'],
  [/الطب|كلية طب /, 'med'],
  [/الحاسبات|الذكاء الاصطناعي|الذكاء الاصطناعى|علوم الحاسب|المعلوماتية/, 'cs'],
  [/الاقتصاد والعلوم السياسية|الدراسات الاقتصادية|السياسة والاقتصاد/, 'econ-pol'],
  [/الاقتصاد المنزل/, 'home-econ'],
  [/تكنولوجيا الإدارة/, 'mgmt-tech'],
  [/الشريعة/, 'sharia-law'],
  [/التجارة|إدارة الأعمال|ادارة الاعمال|الأعمال|الاعمال|الإدارة|الادارة/, 'com'],
  [/الحقوق|القانون/, 'law'],
  [/الإعلام|الاعلام/, 'media'],
  [/الألسن|الالسن|اللغات/, 'alsun'],
  [/البنات للآداب|البنات للاداب/, 'girls'],
  [/دار العلوم/, 'dar-uloom'],
  [/الآثار|الاثار/, 'archaeology'],
  [/السياحة/, 'tourism'],
  [/الخدمة الاجتماعية/, 'social-work'],
  [/التربية الرياضي|علوم الرياضة/, 'pe'],
  [/التربية النوعية/, 'spec-edu'],
  [/طفولة|رياض الأطفال|رياض الاطفال/, 'kg'],
  [/التربية الفنية/, 'art-edu'],
  [/التربية الموسيقية/, 'music-edu'],
  [/التكنولوجيا والتعليم|التعليم الصناعي/, 'tech-edu'],
  [/التربية/, 'edu'],
  [/الفنون الجميلة/, 'arch'],
  [/الفنون التطبيقي|الفنون والتصميم/, 'applied-arts'],
  [/التكنولوجيا والتنمية/, 'tech-dev'],
  [/التكنولوجيا الحيوية/, 'sci'],
  [/أصول الدين|اصول الدين/, 'usul-din'],
  [/الدعوة/, 'dawa'],
  [/القرآن/, 'quran'],
  [/البنات الأزهرية|البنات الازهرية|البنات الإسلامية|البنات الاسلامية/, 'azhar-girls'],
  [/اللغة العربية/, 'arabic-lang'],
  [/الدراسات الإسلامية|الدراسات الاسلامية/, 'islamic-arabic'],
  [/الدراسات الإنسانية|الدراسات الانسانية/, 'human-studies'],
  [/الثروة السمكية|المصايد|الاستزراع/, 'fisheries'],
  [/الآداب|الاداب/, 'arts'],
  [/الزراعة/, 'agri'],
  [/العلوم/, 'sci'],
];

const kindOf = (name: string) => {
  // Institutes and whole-university entries are not faculties a student applies to.
  if (/^(المعهد|معهد|جامعة|الجامعة)/.test(name.trim())) return null;
  const t = tidy(name);
  return KIND_RULES.find(([re]) => re.test(t))?.[1] ?? null;
};

/** For comparing spellings: no "كلية", unified alef / yaa / taa marbuta, no diacritics. */
const norm = (s: string) =>
  s
    .replace(/[ً-ْ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/كليه|كلية/g, '')
    .replace(/[()\-،,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/** Words for overlap; "بحلوان" also counts as "حلوان", but "بنين" stays "بنين". */
const tokens = (s: string) => {
  const out = new Set<string>();
  for (const w of norm(s).split(' ')) {
    const t = w.replace(/^و(?=ال)/, '').replace(/^(بال|لل|ال)/, '');
    if (t.length < 2) continue;
    out.add(t);
    if (t.startsWith('ب') && t.length > 4) out.add(t.slice(1));
  }
  return out;
};

/** NAQAAE spells some names loosely; show the standard Arabic spelling. */
const tidy = (s: string) =>
  s
    .replace(/الصيدله/g, 'الصيدلة')
    .replace(/الاسنان/g, 'الأسنان')
    .replace(/الاعلام/g, 'الإعلام')
    .replace(/الاداب/g, 'الآداب')
    .replace(/الالسن/g, 'الألسن')
    .replace(/الاثار/g, 'الآثار')
    .replace(/البيطرى/g, 'البيطري')
    .replace(/الطبيعى/g, 'الطبيعي')
    .replace(/المنزلى/g, 'المنزلي')
    .replace(/الاصطناعى/g, 'الاصطناعي')
    .replace(/التربيه/g, 'التربية')
    .replace(/الرياضيه/g, 'الرياضية')
    .replace(/كليه/g, 'كلية')
    .replace(/\s*و\s+/g, ' و')
    .replace(/\s+/g, ' ')
    .trim();

/** Prototype quotes presented as graduates' words — not real people; hidden from now on. */
export async function hidePlaceholders(db: Db, legacyQuotes: string[]) {
  const quotes = await db.facultyInsight.updateMany({
    where: { mentorId: null, quote: { in: legacyQuotes }, isPublished: true },
    data: { isPublished: false },
  });
  // Old seed gave every faculty the same generic department list (slugs "d1-…").
  const departments = await db.department.updateMany({
    where: {
      slug: { startsWith: 'd' },
      sourceUrl: null,
      isActive: true,
      NOT: { slug: { startsWith: 'd-' } },
    },
    data: { isActive: false },
  });
  return { quotes: quotes.count, departments: departments.count };
}

export async function seedCatalog(db: Db, logger: Logger) {
  // ---------- universities ----------
  for (const [i, u] of ALL_UNIVERSITIES.entries()) {
    const data = {
      nameAr: u.nameAr,
      nameEn: u.nameEn ?? null,
      type: u.type,
      governorate: u.governorate ?? null,
      website: u.website ?? null,
      sourceUrl: UNIVERSITY_LIST_SOURCE,
      isActive: true,
      sortOrder: i,
    };
    for (const old of u.formerSlugs ?? []) {
      const prev = await db.university.findUnique({ where: { slug: old } });
      const taken = await db.university.findUnique({ where: { slug: u.slug } });
      if (prev && !taken)
        await db.university.update({ where: { id: prev.id }, data: { slug: u.slug } });
    }
    const existing = await db.university.findUnique({
      where: { slug: u.slug },
      select: { adminEditedAt: true },
    });
    if (existing?.adminEditedAt) continue;
    await db.university.upsert({
      where: { slug: u.slug },
      update: data,
      create: { slug: u.slug, ...data },
    });
  }
  const unis = new Map((await db.university.findMany()).map((u) => [u.slug, u]));
  const known = new Set(ALL_UNIVERSITIES.map((u) => u.slug));
  await db.university.updateMany({
    where: { slug: { notIn: [...known] }, adminEditedAt: null },
    data: { isActive: false },
  });

  // ---------- faculty kinds ----------
  for (const [i, k] of KINDS.entries()) {
    const existing = await db.facultyKind.findUnique({
      where: { slug: k.slug },
      select: { adminEditedAt: true },
    });
    if (existing?.adminEditedAt) continue;
    await db.facultyKind.upsert({
      where: { slug: k.slug },
      update: { ...k, sortOrder: i, isActive: true },
      create: { ...k, sortOrder: i },
    });
  }
  const kinds = new Map((await db.facultyKind.findMany()).map((k) => [k.slug, k]));
  const kindIdOf = (slug: string) => {
    const k = kinds.get(slug);
    if (!k) throw new Error(`unknown faculty kind ${slug}`);
    return k.id;
  };

  // ---------- faculties ----------
  interface Wanted {
    university: string;
    kind: string;
    nameAr: string;
    city?: string;
    governorate?: string;
    sourceUrl: string;
  }
  const wanted: Wanted[] = [];
  for (const [slug, { sources, faculties }] of Object.entries(PUBLIC_FACULTIES)) {
    for (const [kind, name] of faculties) {
      wanted.push({
        university: slug,
        kind,
        nameAr: name ?? kinds.get(kind)?.fullNameAr ?? kind,
        sourceUrl: sources[0] ?? NAQAAE_SOURCE,
      });
    }
  }
  for (const f of AZHAR_FACULTIES) {
    wanted.push({
      university: 'azhar',
      kind: f.kind,
      nameAr: f.nameAr,
      city: f.city,
      governorate: f.governorate,
      sourceUrl: AZHAR_SOURCES[0] ?? '',
    });
  }

  const naqaae = JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, NAQAAE_FILE), 'utf8'),
  ) as { faculties: NaqaaeFaculty[] };
  const researched = new Set([...Object.keys(PUBLIC_FACULTIES), 'azhar']);
  // Private, ahliya and international faculties: NAQAAE decisions prove they exist.
  for (const n of naqaae.faculties) {
    const slug = NAQAAE_UNIVERSITY[n.university];
    if (!slug || researched.has(slug)) continue;
    const kind = kindOf(n.faculty);
    if (!kind) continue;
    const nameAr = /^كلي[ةه]/.test(tidy(n.faculty)) ? tidy(n.faculty) : `كلية ${tidy(n.faculty)}`;
    if (wanted.some((w) => w.university === slug && w.nameAr === nameAr)) continue;
    wanted.push({ university: slug, kind, nameAr, sourceUrl: NAQAAE_SOURCE });
  }

  const keep = new Set<string>();
  for (const w of wanted) {
    const uni = unis.get(w.university);
    if (!uni) throw new Error(`unknown university ${w.university}`);
    const kindId = kindIdOf(w.kind);
    let row = await db.faculty.findUnique({
      where: { universityId_nameAr: { universityId: uni.id, nameAr: w.nameAr } },
    });
    if (row?.adminEditedAt) {
      keep.add(row.id);
      continue;
    }
    // A faculty from the old seed (one per kind) keeps its id when it is the only one of its kind.
    const sameKind = wanted.filter((x) => x.university === w.university && x.kind === w.kind);
    if (!row && sameKind.length === 1) {
      row = await db.faculty.findFirst({
        where: { universityId: uni.id, kindId, id: { notIn: [...keep] }, adminEditedAt: null },
      });
    }
    const data = {
      kindId,
      nameAr: w.nameAr,
      city: w.city ?? null,
      governorate: w.governorate ?? null,
      isActive: true,
      sourceUrl: w.sourceUrl,
      verifiedAt: VERIFIED_AT,
    };
    row = row
      ? await db.faculty.update({ where: { id: row.id }, data })
      : await db.faculty.create({ data: { universityId: uni.id, ...data } });
    keep.add(row.id);
  }
  // Hide what research did not confirm, at the universities whose lists we built.
  const hidden = await db.faculty.updateMany({
    where: {
      id: { notIn: [...keep] },
      university: { slug: { in: [...researched, ...Object.values(NAQAAE_UNIVERSITY)] } },
      isActive: true,
      adminEditedAt: null,
    },
    data: { isActive: false },
  });

  // ---------- accreditation ----------
  // Accreditation, departments and cutoffs: only rows the research still owns.
  const faculties = await db.faculty.findMany({
    where: { id: { in: [...keep] }, adminEditedAt: null },
    select: {
      id: true,
      nameAr: true,
      university: { select: { slug: true } },
      kind: { select: { slug: true } },
    },
  });
  let matched = 0;
  const usedRecords = new Set<NaqaaeFaculty>();
  const recordOf = new Map<string, NaqaaeFaculty>();
  const latest = (rs: NaqaaeFaculty[]) =>
    [...rs].sort((a, b) =>
      (b.accreditation?.decidedAt ?? '').localeCompare(a.accreditation?.decidedAt ?? ''),
    )[0];
  // Group by university + kind, then pair faculties with NAQAAE records.
  const groups = new Map<string, typeof faculties>();
  for (const f of faculties) {
    const key = `${f.university.slug}|${f.kind.slug}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  for (const [key, group] of groups) {
    const [slug, kind] = key.split('|');
    let records = naqaae.faculties.filter(
      (n) => NAQAAE_UNIVERSITY[n.university] === slug && kindOf(n.faculty) === kind,
    );
    let open = [...group];
    // 1) same name once normalised
    for (const f of [...open]) {
      const r = records.find((x) => norm(tidy(x.faculty)) === norm(f.nameAr));
      if (r) {
        recordOf.set(f.id, r);
        open = open.filter((x) => x !== f);
        records = records.filter((x) => x !== r);
      }
    }
    // 2) unambiguous best word overlap (city, boys/girls) when several of one kind remain
    if (open.length > 1) {
      for (const f of [...open]) {
        const mine = tokens(f.nameAr);
        const scored = records
          .map((r) => ({ r, score: [...tokens(r.faculty)].filter((t) => mine.has(t)).length }))
          .sort((a, b) => b.score - a.score);
        const best = scored[0];
        if (best && best.score > 0 && best.score > (scored[1]?.score ?? 0)) {
          recordOf.set(f.id, best.r);
          open = open.filter((x) => x !== f);
          records = records.filter((x) => x !== best.r);
        }
      }
    }
    // 3) one faculty left: the latest decision among what is left (renamed / respelled faculty)
    if (open.length === 1 && records.length && open[0]) {
      const r = latest(records);
      if (r) recordOf.set(open[0].id, r);
    }
  }
  for (const f of faculties) {
    const record = recordOf.get(f.id);
    const a = record?.accreditation;
    const status = !record
      ? 'unknown'
      : a && a.status !== 'none'
        ? a.status
        : record.accreditation
          ? 'not_accredited'
          : 'unknown';
    if (record) {
      matched++;
      usedRecords.add(record);
    }
    await db.faculty.update({
      where: { id: f.id },
      data: {
        accreditationStatus: status,
        accreditedAt: a && a.status !== 'none' ? new Date(a.decidedAt) : null,
        accreditationExpiresAt: a && a.status !== 'none' ? new Date(a.expiresAt) : null,
        accreditedPrograms: record?.programmes.length ? record.programmes : Prisma.DbNull,
      },
    });
  }

  if (process.env.CATALOG_REPORT) {
    // Research aid: official NAQAAE faculties no seeded faculty matched (missing ones or spellings).
    for (const n of naqaae.faculties)
      if (NAQAAE_UNIVERSITY[n.university] && !usedRecords.has(n))
        logger.info(
          { university: n.university, faculty: n.faculty, kind: kindOf(n.faculty) },
          'unmatched NAQAAE faculty',
        );
  }

  // ---------- departments ----------
  // Stable slug per name, so re-seeding updates rows instead of duplicating them. Departments added
  // by admins ("d-…" slugs) are never touched.
  const researchedSlug = (nameAr: string) =>
    `w-${createHash('sha256').update(nameAr).digest('hex').slice(0, 12)}`;
  let departments = 0;
  for (const [key, { source, departments: names }] of Object.entries(PUBLIC_DEPARTMENTS)) {
    const [slug, nameAr] = key.split('|');
    const faculty = faculties.find((x) => x.university.slug === slug && x.nameAr === nameAr);
    if (!faculty) {
      logger.warn({ key }, 'departments without faculty (missing, or curated by an admin)');
      continue;
    }
    const slugs = names.map(researchedSlug);
    for (const [i, name] of names.entries()) {
      // Existing rows keep their name and visibility: an admin may have renamed or hidden them.
      await db.department.upsert({
        where: { facultyId_slug: { facultyId: faculty.id, slug: slugs[i] ?? '' } },
        update: { sourceUrl: source },
        create: { facultyId: faculty.id, slug: slugs[i] ?? '', nameAr: name, sourceUrl: source },
      });
      departments++;
    }
    await db.department.updateMany({
      where: { facultyId: faculty.id, slug: { startsWith: 'w-', notIn: slugs } },
      data: { isActive: false },
    });
  }

  // ---------- cutoffs ----------
  let cutoffs = 0;
  for (const [slug, f, track, score] of CUTOFFS_2026) {
    const kind = kinds.get(f);
    const name = kind ? null : f;
    const faculty = faculties.find(
      (x) => x.university.slug === slug && (name ? x.nameAr === name : x.kind.slug === f),
    );
    if (!faculty) {
      logger.warn({ slug, f }, 'cutoff without faculty');
      continue;
    }
    await db.facultyCutoff.upsert({
      where: { facultyId_year_track_phase: { facultyId: faculty.id, year: 2026, track, phase: 1 } },
      update: { minScore: score, maxScore: 320, sourceUrl: CUTOFFS_2026_SOURCE },
      create: {
        facultyId: faculty.id,
        year: 2026,
        track,
        phase: 1,
        minScore: score,
        maxScore: 320,
        sourceUrl: CUTOFFS_2026_SOURCE,
      },
    });
    cutoffs++;
  }

  logger.info(
    {
      universities: ALL_UNIVERSITIES.length,
      facultyKinds: KINDS.length,
      faculties: keep.size,
      hiddenFaculties: hidden.count,
      accreditationMatched: matched,
      naqaaeRecordsUnused: naqaae.faculties.filter(
        (n) => NAQAAE_UNIVERSITY[n.university] && !usedRecords.has(n),
      ).length,
      departments,
      cutoffs,
    },
    'catalog seeded',
  );
}
