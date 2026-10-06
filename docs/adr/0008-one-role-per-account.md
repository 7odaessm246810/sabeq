# 0008 — One role per account

**Decision (product owner, 2026-10-06).** An account is exactly one of `student`, `mentor` or `admin`. The same account cannot be both a student and a mentor; someone who wants both needs two accounts with two phone numbers.

**Consequences.** Simpler authorization and UI. The phone number is unique across all accounts.
