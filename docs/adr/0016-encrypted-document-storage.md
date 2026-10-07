# 0016 — Mentor documents: S3-compatible private storage, encrypted by the API

**Context.** Mentor applicants upload a degree or proof of employment and the front of their national ID. The product owner decided (2026-10-07) to keep these images, encrypted. They must never be reachable by URL, and a leaked storage credential must not expose them.

**Decision (Phase 09).**

- **Storage:** one private bucket behind the S3 API (`infra/storage.ts`, `@aws-sdk/client-s3`). Hosted: Cloudflare R2 (no egress fees) or AWS S3. Local: the `storage` service in compose — `versity/versitygw` (S3 gateway on a Docker volume). MinIO was the plan but its images are no longer published.
- **Encryption in the API before upload:** AES-256-GCM, a random 96-bit IV per file, the object key bound as additional data (a blob copied to another key will not decrypt). Each row stores the key id (`mentor_documents.encryption_key_id`). Keys come from `DOCUMENTS_ENCRYPTION_KEYS` (`id:base64`, comma-separated) and `DOCUMENTS_ENCRYPTION_ACTIVE_KEY`; rotation = add a new key, make it active, keep the old one listed.
- **Upload path:** the browser sends the raw file to `/api/v1/mentor/application/documents/:slot` through the Next.js rewrite. The API accepts only PDF / JPEG / PNG / WebP, decided by the file's bytes (not its name or declared type), up to 10 MB. The SHA-256 of the plain file is stored for integrity.
- **Reading:** only through the API — admins in Phase 10, with every access written to `audit_logs`. Students never see documents.

**Consequences.** Losing a document key makes the files sealed with it unreadable — keys live in the hosting secret store and in an offline backup. Files pass through the API (memory ≤ 10 MB per upload); presigned direct uploads are not possible because the API must encrypt.
