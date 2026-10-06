import { Icon, Logo } from '@sabeq/ui';
import Link from 'next/link';
import { FOOTER_COLUMNS, SITE, SOCIAL_LINKS } from '@/lib/site';
import { NewsletterForm } from './NewsletterForm';

export function Footer() {
  return (
    <footer className="foot">
      <div className="sb-container">
        <div className="foot-in">
          <div>
            <Logo size={32} night />
            <p className="foot-tagline">{SITE.tagline}</p>
            <NewsletterForm />
            <div className="soc">
              {SOCIAL_LINKS.map((s) => (
                <a key={s.icon} href={s.href} aria-label={s.label} rel="noopener noreferrer">
                  <Icon name={s.icon} />
                </a>
              ))}
            </div>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h4>{col.title}</h4>
              <ul>
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="foot-bot">
          <span>© 2026 سابق. صُنع في مصر.</span>
          <span className="foot-lang">
            <Link href="/" hrefLang="ar" lang="ar">
              العربية
            </Link>
            {/* The English version is out of launch scope; the link stays as designed. */}
            <a href="#" hrefLang="en" lang="en" aria-disabled="true">
              English
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
