'use client';

import { Avatar, Icon, OrgLogo } from '@sabeq/ui';
import { normalizeArabic } from '@sabeq/utils';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  forgetSearches,
  logSearch,
  popularTerms,
  recentSearches,
  rememberSearch,
  suggest,
  type Suggestions,
} from '@/lib/search';

/** Marks the typed text inside a suggestion, whatever the spelling («هندسه» marks «هندسة»). */
function highlight(text: string, q: string): ReactNode {
  const needle = normalizeArabic(q);
  if (!needle) return text;
  // Same length per character after folding, except removed diacritics — good enough to locate.
  const folded = [...text].map((c) => normalizeArabic(c) || c);
  const joined = folded.join('');
  const at = joined.indexOf(needle);
  if (at < 0) return text;
  let pos = 0;
  let start = -1;
  let end = -1;
  for (let i = 0; i < folded.length; i++) {
    if (pos === at && start < 0) start = i;
    pos += (folded[i] ?? '').length;
    if (pos >= at + needle.length && start >= 0) {
      end = i + 1;
      break;
    }
  }
  if (start < 0 || end < 0) return text;
  const chars = [...text];
  return (
    <Fragment>
      {chars.slice(0, start).join('')}
      <mark>{chars.slice(start, end).join('')}</mark>
      {chars.slice(end).join('')}
    </Fragment>
  );
}

interface Item {
  key: string;
  href: string;
  /** What is remembered and counted when this item is picked. */
  term: string;
}

/**
 * The landing page's search box (Phase 13 — design «search-focus-empty / typing / no-results»).
 * Empty: this device's recent searches and the week's popular terms. Typing: fields, faculties at
 * universities and mentors from the API (150 ms debounce, skeleton after 300 ms).
 */
export function SearchSuggest() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Suggestions | null>(null);
  const [slow, setSlow] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [popular, setPopular] = useState<string[] | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const s = q.trim();

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // «/» focuses the search, as the keyboard hint promises.
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (!s) return;
    const ctrl = new AbortController();
    const skeleton = setTimeout(() => setSlow(true), 300);
    const timer = setTimeout(() => {
      suggest(s, ctrl.signal)
        .then((d) => {
          setData(d);
          setActive(0);
        })
        .catch(() => undefined)
        .finally(() => {
          clearTimeout(skeleton);
          setSlow(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      clearTimeout(skeleton);
      ctrl.abort();
    };
  }, [s]);

  function onOpen() {
    setOpen(true);
    setRecent(recentSearches());
    if (popular === null) void popularTerms().then(setPopular);
  }

  const items: Item[] = data
    ? [
        ...data.fields.map((f) => ({ key: `f-${f.slug}`, href: `/faculty/${f.slug}`, term: s })),
        ...data.colleges.map((c) => ({ key: `c-${c.id}`, href: `/college/${c.id}`, term: s })),
        ...data.mentors.map((m) => ({ key: `m-${m.slug}`, href: `/mentor/${m.slug}`, term: s })),
      ]
    : [];

  function commit(href: string, term: string) {
    rememberSearch(term);
    logSearch(term);
    setOpen(false);
    router.push(href);
  }
  const searchAll = (term: string) => commit(`/explore?q=${encodeURIComponent(term)}`, term);

  const empty = Boolean(s && data && !items.length && !slow);
  const optionProps = (i: number, item: Item) => ({
    id: `sg-${item.key}`,
    className: 'sb-suggest-item',
    role: 'option' as const,
    'aria-selected': i === active,
    onMouseEnter: () => setActive(i),
    onClick: () => commit(item.href, item.term),
  });
  let i = -1;

  return (
    <div className="sb-search sb-reveal" ref={wrapRef} style={{ zIndex: 5 }}>
      <div className="sb-search-box">
        <span style={{ display: 'inline-flex', width: 20, height: 20 }}>
          <Icon name="search" />
        </span>
        <input
          ref={inputRef}
          value={q}
          placeholder="ابحث عن كلية، قسم، جامعة أو مرشد"
          aria-label="بحث"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="home-suggest"
          aria-activedescendant={s && items[active] ? `sg-${items[active].key}` : undefined}
          onFocus={onOpen}
          onChange={(e) => {
            setQ(e.target.value);
            if (!e.target.value.trim()) setData(null);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              e.currentTarget.blur();
            } else if (e.key === 'ArrowDown' && items.length) {
              e.preventDefault();
              setActive((a) => (a + 1) % items.length);
            } else if (e.key === 'ArrowUp' && items.length) {
              e.preventDefault();
              setActive((a) => (a - 1 + items.length) % items.length);
            } else if (e.key === 'Enter' && s) {
              const item = items[active];
              if (item) commit(item.href, item.term);
              else searchAll(s);
            }
          }}
        />
        <span className="sb-kbd">/</span>
      </div>
      <div className={`sb-suggest${open ? ' is-open' : ''}`} id="home-suggest" role="listbox">
        {!s ? (
          recent.length || popular?.length ? (
            <>
              {recent.length ? (
                <div className="sb-suggest-group">
                  <div className="sb-suggest-title">
                    بحثت مؤخرًا
                    <button
                      type="button"
                      className="sb-btn sb-btn--link sg-clear"
                      onClick={() => {
                        forgetSearches();
                        setRecent([]);
                      }}
                    >
                      امسح
                    </button>
                  </div>
                  {recent.map((t) => (
                    <div
                      key={t}
                      className="sb-suggest-item"
                      role="option"
                      aria-selected={false}
                      onClick={() => searchAll(t)}
                    >
                      <span className="ico">
                        <Icon name="history" />
                      </span>
                      {t}
                    </div>
                  ))}
                </div>
              ) : null}
              {popular?.length ? (
                <div className="sb-suggest-group">
                  <div className="sb-suggest-title">الأكثر بحثًا الأسبوع ده</div>
                  <div className="sb-suggest-chips">
                    {popular.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className="sb-chip sb-chip--sm"
                        onClick={() => searchAll(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="sb-empty" style={{ padding: 20 }}>
              <p style={{ fontSize: 14 }}>
                اكتب اسم كلية أو جامعة أو مرشد — مثلًا «هندسة القاهرة».
              </p>
            </div>
          )
        ) : slow && !data ? (
          <div className="sb-suggest-group" aria-busy="true">
            {[0, 1, 2].map((k) => (
              <div key={k} className="sb-suggest-item">
                <span className="sb-skeleton" style={{ width: 28, height: 28, borderRadius: 8 }} />
                <span className="sb-skeleton" style={{ height: 12, width: `${60 - k * 12}%` }} />
              </div>
            ))}
          </div>
        ) : empty ? (
          <div className="sb-empty" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 16 }}>مفيش نتايج لـ «{s}»</h3>
            <p style={{ fontSize: 14 }}>جرّب اسم الكلية من غير «كلية»، أو اختار من الكليات تحت.</p>
          </div>
        ) : data ? (
          <>
            {data.fields.length || data.colleges.length ? (
              <div className="sb-suggest-group">
                <div className="sb-suggest-title">كليات وجامعات</div>
                {data.fields.map((f) => {
                  i++;
                  const item = items[i];
                  return item ? (
                    <div key={item.key} {...optionProps(i, item)}>
                      <span className="ico">
                        <Icon name={f.icon} />
                      </span>
                      <span>{highlight(f.name, s)}</span>
                      <span className="meta">
                        {f.mentorCount ? `${f.mentorCount} مرشد` : 'كل الجامعات'}
                      </span>
                    </div>
                  ) : null;
                })}
                {data.colleges.map((c) => {
                  i++;
                  const item = items[i];
                  return item ? (
                    <div key={item.key} {...optionProps(i, item)}>
                      <OrgLogo src={c.logo} name={c.university} icon={c.icon} size={28} />
                      <span>
                        {highlight(c.name, s)}{' '}
                        <span className="sb-caption">· {highlight(c.university, s)}</span>
                      </span>
                    </div>
                  ) : null;
                })}
              </div>
            ) : null}
            {data.mentors.length ? (
              <div className="sb-suggest-group">
                <div className="sb-suggest-title">مرشدين</div>
                {data.mentors.map((m) => {
                  i++;
                  const item = items[i];
                  return item ? (
                    <div key={item.key} {...optionProps(i, item)}>
                      <Avatar
                        name={m.name}
                        size="sm"
                        verified
                        tone={m.tone}
                        {...(m.photo ? { src: m.photo } : {})}
                      />
                      <span>
                        {highlight(m.name, s)}{' '}
                        <span className="sb-caption">
                          · {highlight(m.major, s)}، {m.university}
                        </span>
                      </span>
                      <span className="meta">{m.rating === null ? 'جديد' : `★ ${m.rating}`}</span>
                    </div>
                  ) : null;
                })}
              </div>
            ) : null}
            <button
              type="button"
              className="sb-btn sb-btn--link sg-all"
              onClick={() => searchAll(s)}
            >
              كل نتايج «{s}» في استكشف الكليات
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
