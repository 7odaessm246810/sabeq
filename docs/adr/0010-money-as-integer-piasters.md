# 0010 — Money as integer piasters

**Decision.** Every amount is an integer number of piasters (1 EGP = 100 piasters) in the database, the API and the code. Floats are never used for money. Formatting for display happens only at the edge (`formatEGP`).

**Consequences.** No rounding drift between booking, payment, commission and payout records.
