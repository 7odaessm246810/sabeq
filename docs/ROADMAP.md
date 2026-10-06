# SABEQ — Roadmap (23 Phases)

> القاعدة: ما ننتقلش لـ Phase جديدة إلا لما الحالية تبقى مستقرة ومراجَعة.
> كل Phase: هدف → Requirements → Architecture → الملفات → التنفيذ → Testing → Checklist → تسليم.

## Source of truth للتصميم

- `C:\Users\DELL\Downloads\SABEQ-design-handoff\SABEQ-design-handoff\`
  - `prototype/sabeq-site.html` — أدق مرجع للمسافات والنصوص والحركة.
  - `design-system/` — tokens.json, README (brand book), Motion, Accessibility, Responsive, UX Flows, bundle.css/js, logos.
  - `screenshots/` — 80 screenshot لكل صفحة وكل state (desktop / tablet / mobile).
- Design System artifact: https://claude.ai/artifact/W3KwY6Ky9S4ygzzphyuGua
- **Light mode فقط.** الـ dark tokens مش هتتنفذ.
- Arabic first: `lang="ar" dir="rtl"`، "قدام" = شمال.
- كل شاشة: Loading (skeleton) + Empty + Error.

## Stack (مقفول)

| Layer                  | Tech                                                                    |
| ---------------------- | ----------------------------------------------------------------------- |
| Web (Student + Mentor) | Next.js (App Router) + React 19 + TypeScript + CSS Modules / modern CSS |
| Admin                  | Next.js app منفصل (`admin.` subdomain)                                  |
| API                    | Node.js 24 LTS + Express 5 + TypeScript، `/api/v1`                      |
| Repo                   | Monorepo                                                                |
| Containers             | Docker لكل service + docker compose للتطوير                             |

## Architecture

```
sabeq/
├── apps/
│   ├── web/      # Next.js — الطالب والمرشد
│   ├── admin/    # Next.js — لوحة التحكم
│   └── api/      # Express 5 — عقل المنصة
├── packages/
│   ├── ui/       # Design system components (sb-)
│   ├── tokens/   # design tokens → CSS variables
│   ├── types/    # shared DTOs / API contracts
│   ├── config/   # tsconfig / eslint / prettier المشتركة
│   └── utils/
├── docker/
├── docs/
├── .env.example
├── docker-compose.yml
└── package.json
```

## Phases

| #   | Phase                                                                             | الحالة                                  |
| --- | --------------------------------------------------------------------------------- | --------------------------------------- |
| 01  | Project Architecture & Technical Foundation                                       | ✅ done                                 |
| 02  | Development Environment & Docker                                                  | 🔍 review — مستني Docker للتشغيل الفعلي |
| 03  | Frontend Foundation (Next.js, fonts, RTL, layout, SEO, error/loading)             | 🔍 review                               |
| 04  | Frontend Design System Implementation (components + كل الصفحات بـ mock data)      | —                                       |
| 05  | Backend Foundation (Express 5, errors, logging, validation, `/api/v1`, health)    | —                                       |
| 06  | Database Architecture — PostgreSQL + Prisma (ERD أولًا)                           | —                                       |
| 07  | Authentication & Authorization — Phone + OTP، roles: student / mentor / admin     | —                                       |
| 08  | Student Account                                                                   | —                                       |
| 09  | Mentor Onboarding (Draft → Submitted → Under Review → Approved/Rejected)          | —                                       |
| 10  | Admin Verification System + Audit trail                                           | —                                       |
| 11  | University / Faculty / Department / Specialization                                | —                                       |
| 12  | Mentor Profiles                                                                   | —                                       |
| 13  | Search & Discovery                                                                | —                                       |
| 14  | Availability & Scheduling (no double booking / overlap)                           | —                                       |
| 15  | Booking System (Pending / Confirmed / Cancelled / Completed / No-show / Refunded) | —                                       |
| 16  | Payment System — Paymob، التأكيد من الـ Backend فقط (webhooks + HMAC)             | —                                       |
| 17  | Session Management                                                                | —                                       |
| 18  | Reviews & Ratings (بعد الجلسة فقط، بدون تكرار)                                    | —                                       |
| 19  | Notifications (in-app + email، SMS لاحقًا)                                        | —                                       |
| 20  | Admin Dashboard                                                                   | —                                       |
| 21  | Security & Production Hardening                                                   | —                                       |
| 22  | Testing & QA (unit / integration / E2E)                                           | —                                       |
| 23  | Deployment & Production (web + admin + api منفصلين)                               | —                                       |

## ملاحظات تقنية اتضافت على الخطة (من مراجعة التصميم)

1. **Login في التصميم = رقم موبايل + OTP** (`screenshots/07-login`)، مش email/password. محتاج SMS provider.
2. **الدفع في التصميم = بطاقة + محفظة + فوري** (`screenshots/06-booking`) → provider مصري (Paymob مثلًا).
3. **Redis** مطلوب لـ: rate limiting، OTP، حجز الموعد مؤقتًا أثناء الدفع (slot hold)، queues للإشعارات.
4. **Storage خاص (private bucket)** لمستندات توثيق المرشدين — signed URLs بس.
5. تسجيل الدخول مطلوب **عند الحجز بس**، الاستكشاف مفتوح (SEO مهم جدًا للصفحات العامة).
6. العملة EGP، التوقيت Africa/Cairo.

## Decisions log

| التاريخ    | القرار                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------- |
| 2026-10-06 | Light mode فقط. Monorepo. Next.js + Express 5 + TS. Node 24 LTS.                          |
| 2026-10-06 | Auth = Phone + OTP (email اختياري).                                                       |
| 2026-10-06 | Database = PostgreSQL + Prisma.                                                           |
| 2026-10-06 | Payments = Paymob (بطاقة + محافظ + فوري/كشك) خلف payment abstraction.                     |
| 2026-10-06 | كل صفحات التصميم تتبني في Phase 03–04 بـ mock data، وكل Phase بعدها تربط صفحتها بالـ API. |
| 2026-10-06 | حساب واحد = دور واحد (طالب أو مرشد أو أدمن) — ADR-0008.                                   |
| 2026-10-06 | الفيديو جوه الموقع (provider يتحدد في Phase 17).                                          |
| 2026-10-06 | عمولة المنصة 10%؛ تحويل المرشد: بنكي / InstaPay / Vodafone Cash — ADR-0009.               |
| 2026-10-06 | SMS: local Egyptian provider + Twilio Verify fallback (مقترح) — ADR-0011.                 |
| 2026-10-06 | TypeScript 6.0.3 مثبت (typescript-eslint لسه ما يدعمش 7) — ADR-0002.                      |

كل القرارات بالتفصيل: [docs/adr/](adr/README.md).
