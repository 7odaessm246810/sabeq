/**
 * Mentor payouts (Phase 20, ADR-0009).
 *
 * - The mentor enters how they get paid (InstaPay, Vodafone Cash or a bank account). The details are
 *   sealed with the document keys (AES-256-GCM, bound to the mentor) and shown back masked.
 * - The balance is the mentor's ledger: + earnings (completed sessions, absent students),
 *   − reversals (admin refunds), − payouts.
 * - Finance pays outside Sabeq (the bank / InstaPay app), then records it here: a `paid` payout and
 *   its negative ledger entry, under a row lock so the same balance is never paid twice. Opening a
 *   mentor's full details and every payout are audited.
 */
import { PAYOUT_METHOD_LABELS, type PayoutDetails } from '@sabeq/types';
import { formatEgyptianMobile } from '@sabeq/utils';
import { AppError, Errors } from '../../core/errors.js';
import type { Db } from '../../infra/db.js';
import type { DocumentCrypto } from '../../infra/document-crypto.js';
import { writeAudit, type AdminActor } from '../admin/audit.js';

const MESSAGES = {
  notMentor: 'الحساب ده مش حساب مرشد.',
  noAccount: 'المرشد ده لسه ما ضافش طريقة استلام الفلوس.',
  tooMuch: 'المبلغ أكبر من رصيد المرشد.',
  nothing: 'مفيش رصيد للمرشد ده.',
};

const aad = (mentorId: string) => `payout-account:${mentorId}`;
const last4 = (s: string) => `•••• ${s.replace(/\s/g, '').slice(-4)}`;

/** What anyone but finance sees: the method and the last digits. */
export function maskPayout(d: PayoutDetails): string {
  if (d.method === 'vodafone_cash')
    return `${PAYOUT_METHOD_LABELS.vodafone_cash} · ${last4(d.phone)}`;
  if (d.method === 'instapay') {
    const [name = '', domain] = d.address.split('@');
    return `InstaPay · ${name.slice(0, 2)}•••${domain ? `@${domain}` : last4(d.address)}`;
  }
  return `${d.bankName} · ${last4(d.accountNumber)}`;
}

export function createPayoutsService(deps: { db: Db; crypto: DocumentCrypto; now?: () => Date }) {
  const { db, crypto, now = () => new Date() } = deps;

  function seal(mentorId: string, details: PayoutDetails) {
    const { keyId, blob } = crypto.seal(Buffer.from(JSON.stringify(details)), aad(mentorId));
    return `${keyId}:${blob.toString('base64')}`;
  }
  function open(mentorId: string, sealed: string): PayoutDetails {
    const i = sealed.indexOf(':');
    const plain = crypto.open(
      Buffer.from(sealed.slice(i + 1), 'base64'),
      sealed.slice(0, i),
      aad(mentorId),
    );
    return JSON.parse(plain.toString()) as PayoutDetails;
  }

  async function balanceOf(mentorId: string, tx: Pick<Db, 'ledgerEntry'> = db) {
    const sums = await tx.ledgerEntry.groupBy({
      by: ['type'],
      where: { mentorId },
      _sum: { amountPiasters: true },
    });
    const of = (t: string) => sums.find((s) => s.type === t)?._sum.amountPiasters ?? 0;
    const earned = of('mentor_earning') + of('refund_reversal');
    const paid = -of('payout');
    return { earned, paid, balance: earned - paid };
  }

  return {
    // ---------- the mentor ----------

    async getAccount(mentorId: string) {
      const a = await db.payoutAccount.findUnique({ where: { mentorId } });
      if (!a) return null;
      return {
        method: a.method,
        display: maskPayout(open(mentorId, a.detailsEnc)),
        updatedAt: a.updatedAt.toISOString(),
      };
    },

    async setAccount(mentorId: string, details: PayoutDetails) {
      const mentor = await db.mentor.findUnique({
        where: { userId: mentorId },
        select: { userId: true },
      });
      if (!mentor) throw Errors.notFound(MESSAGES.notMentor);
      const detailsEnc = seal(mentorId, details);
      await db.payoutAccount.upsert({
        where: { mentorId },
        create: { mentorId, method: details.method, detailsEnc },
        // A changed account must be checked again before money goes to it.
        update: { method: details.method, detailsEnc, verifiedAt: null },
      });
      return {
        method: details.method,
        display: maskPayout(details),
        updatedAt: now().toISOString(),
      };
    },

    async earnings(mentorId: string) {
      const [b, payouts] = await Promise.all([
        balanceOf(mentorId),
        db.payout.findMany({
          where: { mentorId },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            amountPiasters: true,
            method: true,
            status: true,
            paidAt: true,
            createdAt: true,
          },
        }),
      ]);
      return {
        balanceEgp: b.balance / 100,
        earnedEgp: b.earned / 100,
        paidEgp: b.paid / 100,
        payouts: payouts.map((p) => ({
          id: p.id,
          amountEgp: p.amountPiasters / 100,
          method: p.method,
          status: p.status,
          date: (p.paidAt ?? p.createdAt).toISOString(),
        })),
      };
    },

    // ---------- finance ----------

    /** Mentors with money owed (or a payout account), most owed first. */
    async balances() {
      const sums = await db.ledgerEntry.groupBy({
        by: ['mentorId'],
        _sum: { amountPiasters: true },
      });
      const owed = new Map(sums.map((s) => [s.mentorId, s._sum.amountPiasters ?? 0]));
      const ids = [...owed.keys()];
      const mentors = await db.mentor.findMany({
        where: { userId: { in: ids } },
        select: {
          userId: true,
          slug: true,
          user: { select: { fullName: true, phone: true } },
          payoutAccount: { select: { method: true, detailsEnc: true, verifiedAt: true } },
          payouts: { orderBy: { createdAt: 'desc' }, take: 1, select: { paidAt: true } },
        },
      });
      return mentors
        .map((m) => ({
          mentorId: m.userId,
          slug: m.slug,
          name: m.user.fullName ?? 'مرشد',
          phone: formatEgyptianMobile(m.user.phone),
          balanceEgp: (owed.get(m.userId) ?? 0) / 100,
          account: m.payoutAccount
            ? {
                method: m.payoutAccount.method,
                display: maskPayout(open(m.userId, m.payoutAccount.detailsEnc)),
              }
            : null,
          lastPaidAt: m.payouts[0]?.paidAt?.toISOString() ?? null,
        }))
        .sort((a, b) => b.balanceEgp - a.balanceEgp);
    },

    /** The full account details, to make the transfer. Audited. */
    async reveal(actor: AdminActor, mentorId: string) {
      const a = await db.payoutAccount.findUnique({ where: { mentorId } });
      if (!a) throw Errors.notFound(MESSAGES.noAccount);
      await writeAudit(db, actor, 'payout_account.view', { type: 'mentor', id: mentorId });
      return open(mentorId, a.detailsEnc);
    },

    /** Finance paid the mentor outside Sabeq: record it. */
    async record(
      actor: AdminActor,
      input: { mentorId: string; amountPiasters: number; reference: string },
    ) {
      const account = await db.payoutAccount.findUnique({ where: { mentorId: input.mentorId } });
      if (!account) throw new AppError('CONFLICT', MESSAGES.noAccount);
      const payout = await db.$transaction(async (tx) => {
        // One payout per mentor at a time: lock the mentor row, then read the balance.
        await tx.$queryRaw`SELECT 1 FROM mentors WHERE user_id = ${input.mentorId}::uuid FOR UPDATE`;
        const { balance } = await balanceOf(input.mentorId, tx);
        if (balance <= 0) throw new AppError('CONFLICT', MESSAGES.nothing);
        if (input.amountPiasters > balance) throw new AppError('CONFLICT', MESSAGES.tooMuch);
        const first = await tx.ledgerEntry.findFirst({
          where: { mentorId: input.mentorId },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        });
        const created = await tx.payout.create({
          data: {
            mentorId: input.mentorId,
            amountPiasters: input.amountPiasters,
            method: account.method,
            status: 'paid',
            reference: input.reference,
            processedById: actor.auth.userId,
            periodStart: first?.createdAt ?? now(),
            periodEnd: now(),
            paidAt: now(),
          },
        });
        await tx.ledgerEntry.create({
          data: {
            mentorId: input.mentorId,
            payoutId: created.id,
            type: 'payout',
            amountPiasters: -input.amountPiasters,
          },
        });
        await tx.payoutAccount.update({
          where: { mentorId: input.mentorId },
          data: { verifiedAt: account.verifiedAt ?? now() },
        });
        await tx.notification.create({
          data: {
            userId: input.mentorId,
            type: 'payout.paid',
            title: 'حوّلنالك فلوسك',
            body: `حوّلنالك ${input.amountPiasters / 100} ج.م على ${PAYOUT_METHOD_LABELS[account.method]}.`,
            data: { payoutId: created.id },
          },
        });
        await writeAudit(
          tx,
          actor,
          'payout.record',
          { type: 'mentor', id: input.mentorId },
          {
            after: {
              payoutId: created.id,
              amountPiasters: input.amountPiasters,
              reference: input.reference,
            },
          },
        );
        return created;
      });
      return {
        id: payout.id,
        amountEgp: payout.amountPiasters / 100,
        balanceEgp: (await balanceOf(input.mentorId)).balance / 100,
      };
    },

    async history(page: number) {
      const pageSize = 30;
      const [total, rows] = await Promise.all([
        db.payout.count(),
        db.payout.findMany({
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            amountPiasters: true,
            method: true,
            status: true,
            reference: true,
            paidAt: true,
            mentor: { select: { slug: true, user: { select: { fullName: true } } } },
            processedBy: { select: { fullName: true } },
          },
        }),
      ]);
      return {
        items: rows.map((p) => ({
          id: p.id,
          mentor: p.mentor.user.fullName ?? 'مرشد',
          slug: p.mentor.slug,
          amountEgp: p.amountPiasters / 100,
          method: p.method,
          status: p.status,
          reference: p.reference,
          paidAt: p.paidAt?.toISOString() ?? null,
          by: p.processedBy?.fullName ?? null,
        })),
        page: { page, pageSize, total },
      };
    },
  };
}

export type PayoutsService = ReturnType<typeof createPayoutsService>;
