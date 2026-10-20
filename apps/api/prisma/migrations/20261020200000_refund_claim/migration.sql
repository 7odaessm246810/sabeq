-- Security review 2026-10-20: a refund is claimed ('sending') before it goes to Paymob, so two API
-- instances (or the sweeper racing a cancel) can never send it twice; and one refund per payment.
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'sending' AFTER 'pending';
DROP INDEX IF EXISTS "refunds_payment_id_idx";
CREATE UNIQUE INDEX "refunds_payment_id_key" ON "refunds"("payment_id");
