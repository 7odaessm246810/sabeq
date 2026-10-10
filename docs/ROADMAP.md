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

| #   | Phase                                                                             | الحالة                       |
| --- | --------------------------------------------------------------------------------- | ---------------------------- |
| 01  | Project Architecture & Technical Foundation                                       | ✅ done                      |
| 02  | Development Environment & Docker                                                  | ✅ done — 5 services healthy |
| 03  | Frontend Foundation (Next.js, fonts, RTL, layout, SEO, error/loading)             | ✅ done                      |
| 04  | Frontend Design System Implementation (components + كل الصفحات بـ mock data)      | ✅ done                      |
| 05  | Backend Foundation (Express 5, errors, logging, validation, `/api/v1`, health)    | ✅ done                      |
| 06  | Database Architecture — PostgreSQL + Prisma (ERD أولًا)                           | ✅ done                      |
| 07  | Authentication & Authorization — Phone + OTP، roles: student / mentor / admin     | ✅ done                      |
| 08  | Student Account                                                                   | ✅ done                      |
| 09  | Mentor Onboarding (Draft → Submitted → Under Review → Approved/Rejected)          | ✅ done                      |
| 10  | Admin Verification System + Audit trail                                           | ✅ done                      |
| 11  | University / Faculty / Department / Specialization                                | ✅ done                      |
| 12  | Mentor Profiles                                                                   | ✅ done                      |
| 13  | Search & Discovery                                                                | ✅ done                      |
| 14  | Availability & Scheduling (no double booking / overlap)                           | ✅ done                      |
| 15  | Booking System (Pending / Confirmed / Cancelled / Completed / No-show / Refunded) | ✅ done                      |
| 16  | Payment System — Paymob، التأكيد من الـ Backend فقط (webhooks + HMAC)             | ✅ done                      |
| 17  | Session Management                                                                | ✅ done                      |
| 18  | Reviews & Ratings (بعد الجلسة فقط، بدون تكرار)                                    | ✅ done                      |
| 19  | Notifications (in-app + email، SMS لاحقًا)                                        | 🔍 review                    |
| 20  | Admin Dashboard                                                                   | 🔍 review                    |
| 21  | Security & Production Hardening                                                   | —                            |
| 22  | Testing & QA (unit / integration / E2E)                                           | —                            |
| 23  | Deployment & Production (web + admin + api منفصلين)                               | —                            |

## ملاحظات تقنية اتضافت على الخطة (من مراجعة التصميم)

1. **Login في التصميم = رقم موبايل + OTP** (`screenshots/07-login`)، مش email/password. محتاج SMS provider.
2. **الدفع في التصميم = بطاقة + محفظة + فوري** (`screenshots/06-booking`) → provider مصري (Paymob مثلًا).
3. **Redis** مطلوب لـ: rate limiting، OTP، حجز الموعد مؤقتًا أثناء الدفع (slot hold)، queues للإشعارات.
4. **Storage خاص (private bucket)** لمستندات توثيق المرشدين — signed URLs بس.
5. تسجيل الدخول مطلوب **عند الحجز بس**، الاستكشاف مفتوح (SEO مهم جدًا للصفحات العامة).
6. العملة EGP، التوقيت Africa/Cairo.

## Decisions log

| التاريخ    | القرار                                                                                                                                                                                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-06 | Light mode فقط. Monorepo. Next.js + Express 5 + TS. Node 24 LTS.                                                                                                                                                                                                                                                                   |
| 2026-10-06 | Auth = Phone + OTP (email اختياري).                                                                                                                                                                                                                                                                                                |
| 2026-10-06 | Database = PostgreSQL + Prisma.                                                                                                                                                                                                                                                                                                    |
| 2026-10-06 | Payments = Paymob (بطاقة + محافظ + فوري/كشك) خلف payment abstraction.                                                                                                                                                                                                                                                              |
| 2026-10-06 | كل صفحات التصميم تتبني في Phase 03–04 بـ mock data، وكل Phase بعدها تربط صفحتها بالـ API.                                                                                                                                                                                                                                          |
| 2026-10-06 | حساب واحد = دور واحد (طالب أو مرشد أو أدمن) — ADR-0008.                                                                                                                                                                                                                                                                            |
| 2026-10-06 | الفيديو جوه الموقع (provider يتحدد في Phase 17).                                                                                                                                                                                                                                                                                   |
| 2026-10-06 | عمولة المنصة 10%؛ تحويل المرشد: بنكي / InstaPay / Vodafone Cash — ADR-0009.                                                                                                                                                                                                                                                        |
| 2026-10-06 | SMS: local Egyptian provider + Twilio Verify fallback (مقترح) — ADR-0011.                                                                                                                                                                                                                                                          |
| 2026-10-07 | Neon (PostgreSQL, Frankfurt) + Upstash (Redis) لـ staging/production؛ Docker محليًا.                                                                                                                                                                                                                                               |
| 2026-10-07 | المرشدين: خريج / معيد / دكتور فقط. سعر أساسي واحد. إلغاء متأخر = استرداد 50%. صور البطاقات محفوظة مشفّرة.                                                                                                                                                                                                                          |
| 2026-10-10 | رسوم خدمة ثابتة 15 ج.م على الطالب فوق سعر الجلسة (بترجع كاملة لو الإلغاء قبل 24 ساعة). لحد Paymob: دفع تجريبي على جهاز التطوير بس.                                                                                                                                                                                                 |
| 2026-10-10 | Phase 16: Paymob Unified Checkout (بطاقة / محفظة / منافذ أمان ومصاري). لحد ما الحساب يتفعّل: `PAYMOB_MODE=fake` (صفحة دفع تجريبية بتعدّي على نفس التحقق بالـ HMAC) — ممنوع في production.                                                                                                                                          |
| 2026-10-10 | Phase 17: الفيديو = Daily.co (غرفة خاصة لكل جلسة، توكن لكل شخص). المرشد لو ما دخلش خلال 15 دقيقة من البداية → الجلسة بتتلغي والطالب بياخد فلوسه كاملة. غياب الطالب (والمرشد دخل) → مفيش استرداد والمرشد بياخد حقه. لحد ما حساب Daily يتفعّل: `VIDEO_PROVIDER=fake` (غرفة تجريبية) — ممنوع في production.                           |
| 2026-10-10 | Phase 18: التقييم من الطالب بس، بعد جلسة مكتملة، مرة واحدة، خلال 30 يوم. تقييم المرشد = متوسط التقييمات المنشورة (مفيش تقييمات مخترعة). الإخفاء من الأدمن في Phase 20.                                                                                                                                                             |
| 2026-10-10 | Phase 19: الإشعارات جوه الموقع دايمًا (الجرس + صفحة)، وعلى الإيميل لو المستخدم أكّد إيميله برابط. تذكير قبل الجلسة بساعة للاتنين. الإيميل عن طريق Resend (`EMAIL_PROVIDER=resend`)؛ محليًا `console` ورابط التأكيد بيظهر في الصفحة. SMS لاحقًا.                                                                                    |
| 2026-10-10 | Phase 20: لوحة الأدمن = نظرة عامة، الحجوزات (استرداد كامل لحل أي خلاف، حتى بعد الجلسة — مكسب المرشد بيتشال)، التقييمات (إخفاء / رجوع)، الحسابات (إيقاف / رجوع)، فلوس المرشدين. المرشد بيضيف طريقة الاستلام (InstaPay / فودافون كاش / بنك) متشفّرة؛ المالية بتحوّل برّه سابق وبتسجّل التحويل برقم العملية. كل حاجة في سجل العمليات. |
| 2026-10-06 | TypeScript 6.0.3 مثبت (typescript-eslint لسه ما يدعمش 7) — ADR-0002.                                                                                                                                                                                                                                                               |

كل القرارات بالتفصيل: [docs/adr/](adr/README.md).

## Notes from Phase 04 (design port)

- Every design screen is built with sample data (`apps/web/src/lib/mock/data.ts`) and a demo store (`apps/web/src/lib/demo-store.tsx`) that later phases replace with the API.
- Prototype fixes: `.done` collided between the how-it-works steps and the booking confirmation (renamed `.done-ok`); the mentor income calculator used a 15% commission — it now reads the 10% decided in ADR-0009.
- The mobile filter sheet button shows the result count («اعرض 12 مرشد»), as `Responsive.md` specifies.
