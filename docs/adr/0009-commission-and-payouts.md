# 0009 — 10% commission; payouts by bank, InstaPay, Vodafone Cash

**Decision (product owner, 2026-10-06).** The platform keeps 10% of each session price (`PLATFORM.commissionBps = 1000`) and the mentor earns the rest (`splitCommission` in `@sabeq/utils`). Each mentor chooses a payout method: bank transfer, InstaPay or Vodafone Cash.

**Consequences.** Earnings become payable only after the session is completed and the refund window has passed. Payouts are recorded in a ledger and executed by a `finance` admin, and can be automated later if a provider supports it. Rounding: the platform fee rounds half-up and the mentor gets the exact remainder.
