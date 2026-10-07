-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('student', 'mentor', 'admin');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'suspended', 'deleted');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('super_admin', 'verifier', 'support', 'finance');

-- CreateEnum
CREATE TYPE "ClientApp" AS ENUM ('web', 'admin');

-- CreateEnum
CREATE TYPE "StudentTrack" AS ENUM ('science_math', 'science_bio', 'literary', 'azhar', 'other');

-- CreateEnum
CREATE TYPE "UniversityType" AS ENUM ('public', 'private', 'national', 'azhar');

-- CreateEnum
CREATE TYPE "FacultyCategory" AS ENUM ('medical', 'engineering', 'science', 'literary', 'arts');

-- CreateEnum
CREATE TYPE "MentorKind" AS ENUM ('graduate', 'teaching_assistant', 'professor');

-- CreateEnum
CREATE TYPE "MentorApplicationStatus" AS ENUM ('draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('graduation_certificate', 'employment_proof', 'national_id_front');

-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('consultation', 'comparison', 'quick_call');

-- CreateEnum
CREATE TYPE "SessionMedium" AS ENUM ('video', 'audio');

-- CreateEnum
CREATE TYPE "AvailabilityExceptionKind" AS ENUM ('blocked', 'extra');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('bank_transfer', 'instapay', 'vodafone_cash');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('paymob');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('card', 'wallet', 'kiosk');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('pending', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('mentor_earning', 'platform_fee', 'refund_reversal', 'payout');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'processing', 'paid', 'failed');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('published', 'hidden', 'flagged');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('email', 'sms', 'in_app');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('queued', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "ReportTarget" AS ENUM ('mentor', 'review', 'booking');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'resolved', 'dismissed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(16) NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'active',
    "full_name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254),
    "email_verified_at" TIMESTAMPTZ,
    "avatar_key" TEXT,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "user_id" UUID NOT NULL,
    "track" "StudentTrack",
    "school_year" SMALLINT,
    "governorate" VARCHAR(60),

    CONSTRAINT "students_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "admins" (
    "user_id" UUID NOT NULL,
    "admin_role" "AdminRole" NOT NULL,
    "totp_secret_enc" TEXT,
    "totp_enabled_at" TIMESTAMPTZ,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "app" "ClientApp" NOT NULL,
    "refresh_token_hash" VARCHAR(128) NOT NULL,
    "user_agent" VARCHAR(400),
    "ip" INET,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "universities" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name_ar" VARCHAR(120) NOT NULL,
    "name_en" VARCHAR(120),
    "type" "UniversityType" NOT NULL,
    "governorate" VARCHAR(60) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "universities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculty_kinds" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "name_ar" VARCHAR(80) NOT NULL,
    "full_name_ar" VARCHAR(120) NOT NULL,
    "icon" VARCHAR(40) NOT NULL,
    "category" "FacultyCategory" NOT NULL,
    "study_years" SMALLINT NOT NULL,
    "summary" VARCHAR(200) NOT NULL,
    "about" TEXT NOT NULL,
    "generic_info" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "faculty_kinds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculties" (
    "id" UUID NOT NULL,
    "university_id" UUID NOT NULL,
    "kind_id" UUID NOT NULL,
    "name_ar" VARCHAR(160),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "faculties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "faculty_id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name_ar" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specializations" (
    "id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name_ar" VARCHAR(120) NOT NULL,

    CONSTRAINT "specializations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculty_insights" (
    "id" UUID NOT NULL,
    "kind_id" UUID NOT NULL,
    "quote" VARCHAR(400) NOT NULL,
    "mentor_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "faculty_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentors" (
    "user_id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "kind" "MentorKind" NOT NULL,
    "faculty_id" UUID NOT NULL,
    "department_id" UUID,
    "specialization_id" UUID,
    "major_label" VARCHAR(120) NOT NULL,
    "graduation_year" SMALLINT,
    "bio" TEXT NOT NULL DEFAULT '',
    "city" VARCHAR(60),
    "base_price_piasters" INTEGER,
    "is_listed" BOOLEAN NOT NULL DEFAULT false,
    "listed_at" TIMESTAMPTZ,
    "accepts_bookings" BOOLEAN NOT NULL DEFAULT true,
    "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "sessions_completed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "mentors_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "mentor_topics" (
    "id" UUID NOT NULL,
    "mentor_id" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "mentor_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentor_applications" (
    "id" UUID NOT NULL,
    "mentor_id" UUID NOT NULL,
    "status" "MentorApplicationStatus" NOT NULL DEFAULT 'draft',
    "payload" JSONB NOT NULL,
    "submitted_at" TIMESTAMPTZ,
    "reviewer_id" UUID,
    "decided_at" TIMESTAMPTZ,
    "decision_note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "mentor_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentor_documents" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "storage_key" VARCHAR(300) NOT NULL,
    "mime_type" VARCHAR(80) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "encryption_key_id" VARCHAR(120),
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentor_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_offerings" (
    "id" UUID NOT NULL,
    "mentor_id" UUID NOT NULL,
    "kind" "SessionKind" NOT NULL,
    "duration_min" SMALLINT NOT NULL,
    "medium" "SessionMedium" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "session_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_rules" (
    "id" UUID NOT NULL,
    "mentor_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "start_minute" SMALLINT NOT NULL,
    "end_minute" SMALLINT NOT NULL,

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_exceptions" (
    "id" UUID NOT NULL,
    "mentor_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_minute" SMALLINT,
    "end_minute" SMALLINT,
    "kind" "AvailabilityExceptionKind" NOT NULL,

    CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_accounts" (
    "mentor_id" UUID NOT NULL,
    "method" "PayoutMethod" NOT NULL,
    "details_enc" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payout_accounts_pkey" PRIMARY KEY ("mentor_id")
);

-- CreateTable
CREATE TABLE "saved_mentors" (
    "student_id" UUID NOT NULL,
    "mentor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_mentors_pkey" PRIMARY KEY ("student_id","mentor_id")
);

-- CreateTable
CREATE TABLE "student_interests" (
    "student_id" UUID NOT NULL,
    "kind_id" UUID NOT NULL,

    CONSTRAINT "student_interests_pkey" PRIMARY KEY ("student_id","kind_id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "mentor_id" UUID NOT NULL,
    "offering_id" UUID,
    "kind" "SessionKind" NOT NULL,
    "duration_min" SMALLINT NOT NULL,
    "medium" "SessionMedium" NOT NULL,
    "price_piasters" INTEGER NOT NULL,
    "fee_piasters" INTEGER NOT NULL,
    "total_piasters" INTEGER NOT NULL,
    "commission_bps" SMALLINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EGP',
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending',
    "hold_expires_at" TIMESTAMPTZ,
    "student_note" VARCHAR(1000),
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by_id" UUID,
    "cancel_reason" VARCHAR(500),
    "refund_share_bps" SMALLINT,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "booking_id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "room_id" VARCHAR(200) NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,
    "student_joined_at" TIMESTAMPTZ,
    "mentor_joined_at" TIMESTAMPTZ,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("booking_id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'paymob',
    "method" "PaymentMethod" NOT NULL,
    "amount_piasters" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EGP',
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "provider_order_id" VARCHAR(100),
    "provider_txn_id" VARCHAR(100),
    "kiosk_reference" VARCHAR(40),
    "failure_reason" VARCHAR(300),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "succeeded_at" TIMESTAMPTZ,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "payment_id" UUID,
    "provider_event_id" VARCHAR(120) NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "hmac_valid" BOOLEAN NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ,
    "processing_error" VARCHAR(500),

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount_piasters" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'pending',
    "reason" VARCHAR(300) NOT NULL,
    "provider_refund_id" VARCHAR(100),
    "requested_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "mentor_id" UUID NOT NULL,
    "booking_id" UUID,
    "payout_id" UUID,
    "type" "LedgerEntryType" NOT NULL,
    "amount_piasters" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "mentor_id" UUID NOT NULL,
    "amount_piasters" INTEGER NOT NULL,
    "method" "PayoutMethod" NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "reference" VARCHAR(120),
    "processed_by_id" UUID,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "mentor_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "text" VARCHAR(2000),
    "topic" VARCHAR(120),
    "status" "ReviewStatus" NOT NULL DEFAULT 'published',
    "moderated_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "data" JSONB,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'queued',
    "provider_message_id" VARCHAR(120),
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "target_type" "ReportTarget" NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "handled_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_role" VARCHAR(30) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(80) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" INET,
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "email" VARCHAR(254) NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribed_at" TIMESTAMPTZ,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "universities_slug_key" ON "universities"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_kinds_slug_key" ON "faculty_kinds"("slug");

-- CreateIndex
CREATE INDEX "faculties_kind_id_idx" ON "faculties"("kind_id");

-- CreateIndex
CREATE UNIQUE INDEX "faculties_university_id_kind_id_key" ON "faculties"("university_id", "kind_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_faculty_id_slug_key" ON "departments"("faculty_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "specializations_department_id_slug_key" ON "specializations"("department_id", "slug");

-- CreateIndex
CREATE INDEX "faculty_insights_kind_id_is_published_sort_order_idx" ON "faculty_insights"("kind_id", "is_published", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "mentors_slug_key" ON "mentors"("slug");

-- CreateIndex
CREATE INDEX "mentors_faculty_id_is_listed_rating_avg_idx" ON "mentors"("faculty_id", "is_listed", "rating_avg" DESC);

-- CreateIndex
CREATE INDEX "mentors_is_listed_base_price_piasters_idx" ON "mentors"("is_listed", "base_price_piasters");

-- CreateIndex
CREATE INDEX "mentor_topics_mentor_id_sort_order_idx" ON "mentor_topics"("mentor_id", "sort_order");

-- CreateIndex
CREATE INDEX "mentor_applications_mentor_id_created_at_idx" ON "mentor_applications"("mentor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "mentor_applications_status_submitted_at_idx" ON "mentor_applications"("status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "mentor_documents_storage_key_key" ON "mentor_documents"("storage_key");

-- CreateIndex
CREATE INDEX "mentor_documents_application_id_idx" ON "mentor_documents"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_offerings_mentor_id_kind_key" ON "session_offerings"("mentor_id", "kind");

-- CreateIndex
CREATE INDEX "availability_rules_mentor_id_weekday_idx" ON "availability_rules"("mentor_id", "weekday");

-- CreateIndex
CREATE INDEX "availability_exceptions_mentor_id_date_idx" ON "availability_exceptions"("mentor_id", "date");

-- CreateIndex
CREATE INDEX "saved_mentors_mentor_id_idx" ON "saved_mentors"("mentor_id");

-- CreateIndex
CREATE INDEX "bookings_mentor_id_starts_at_idx" ON "bookings"("mentor_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_student_id_starts_at_idx" ON "bookings"("student_id", "starts_at" DESC);

-- CreateIndex
CREATE INDEX "bookings_status_hold_expires_at_idx" ON "bookings"("status", "hold_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_txn_id_key" ON "payments"("provider_txn_id");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- CreateIndex
CREATE INDEX "payments_provider_order_id_idx" ON "payments"("provider_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_event_id_key" ON "payment_events"("provider_event_id");

-- CreateIndex
CREATE INDEX "payment_events_payment_id_idx" ON "payment_events"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_provider_refund_id_key" ON "refunds"("provider_refund_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE INDEX "ledger_entries_mentor_id_created_at_idx" ON "ledger_entries"("mentor_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_booking_id_idx" ON "ledger_entries"("booking_id");

-- CreateIndex
CREATE INDEX "payouts_mentor_id_created_at_idx" ON "payouts"("mentor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payouts_status_idx" ON "payouts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_booking_id_key" ON "reviews"("booking_id");

-- CreateIndex
CREATE INDEX "reviews_mentor_id_status_created_at_idx" ON "reviews"("mentor_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notification_deliveries_notification_id_idx" ON "notification_deliveries"("notification_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_created_at_idx" ON "notification_deliveries"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_target_type_target_id_idx" ON "reports"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculties" ADD CONSTRAINT "faculties_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculties" ADD CONSTRAINT "faculties_kind_id_fkey" FOREIGN KEY ("kind_id") REFERENCES "faculty_kinds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specializations" ADD CONSTRAINT "specializations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_insights" ADD CONSTRAINT "faculty_insights_kind_id_fkey" FOREIGN KEY ("kind_id") REFERENCES "faculty_kinds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_insights" ADD CONSTRAINT "faculty_insights_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentors"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentors" ADD CONSTRAINT "mentors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentors" ADD CONSTRAINT "mentors_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentors" ADD CONSTRAINT "mentors_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentors" ADD CONSTRAINT "mentors_specialization_id_fkey" FOREIGN KEY ("specialization_id") REFERENCES "specializations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_topics" ADD CONSTRAINT "mentor_topics_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentors"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_applications" ADD CONSTRAINT "mentor_applications_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentors"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_applications" ADD CONSTRAINT "mentor_applications_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_documents" ADD CONSTRAINT "mentor_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "mentor_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_offerings" ADD CONSTRAINT "session_offerings_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentors"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentors"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentors"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentors"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_mentors" ADD CONSTRAINT "saved_mentors_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_mentors" ADD CONSTRAINT "saved_mentors_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentors"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_interests" ADD CONSTRAINT "student_interests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_interests" ADD CONSTRAINT "student_interests_kind_id_fkey" FOREIGN KEY ("kind_id") REFERENCES "faculty_kinds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentors"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "session_offerings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentors"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentors"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_processed_by_id_fkey" FOREIGN KEY ("processed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentors"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderated_by_id_fkey" FOREIGN KEY ("moderated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
-- Integrity rules Prisma cannot express. They protect money and bookings even if
-- application code has a bug. Documented in docs/database.md.
-- ════════════════════════════════════════════════════════════════════════════

-- A slot can never be sold twice: no two pending/confirmed bookings of one mentor may overlap.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "mentor_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("status" IN ('pending', 'confirmed'));

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_time_order" CHECK ("ends_at" > "starts_at"),
  ADD CONSTRAINT "bookings_amounts" CHECK (
    "price_piasters" >= 0 AND "fee_piasters" >= 0
    AND "total_piasters" = "price_piasters" + "fee_piasters"
  ),
  ADD CONSTRAINT "bookings_commission" CHECK ("commission_bps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "bookings_refund_share" CHECK ("refund_share_bps" IS NULL OR "refund_share_bps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "bookings_duration" CHECK ("duration_min" BETWEEN 10 AND 180);

-- Mentors set their own base price between 100 and 500 EGP (design: become-mentor calculator).
ALTER TABLE "mentors"
  ADD CONSTRAINT "mentors_base_price" CHECK (
    "base_price_piasters" IS NULL OR "base_price_piasters" BETWEEN 10000 AND 50000
  ),
  ADD CONSTRAINT "mentors_rating" CHECK ("rating_avg" BETWEEN 0 AND 5),
  ADD CONSTRAINT "mentors_counters" CHECK ("rating_count" >= 0 AND "sessions_completed" >= 0);

ALTER TABLE "session_offerings"
  ADD CONSTRAINT "session_offerings_duration" CHECK ("duration_min" BETWEEN 10 AND 180);

ALTER TABLE "availability_rules"
  ADD CONSTRAINT "availability_rules_weekday" CHECK ("weekday" BETWEEN 0 AND 6),
  ADD CONSTRAINT "availability_rules_window" CHECK (
    "start_minute" >= 0 AND "end_minute" <= 1440 AND "start_minute" < "end_minute"
  );

ALTER TABLE "availability_exceptions"
  ADD CONSTRAINT "availability_exceptions_window" CHECK (
    ("start_minute" IS NULL AND "end_minute" IS NULL)
    OR ("start_minute" >= 0 AND "end_minute" <= 1440 AND "start_minute" < "end_minute")
  );

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount" CHECK ("amount_piasters" > 0);

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_amount" CHECK ("amount_piasters" > 0);

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_amount" CHECK ("amount_piasters" <> 0);

ALTER TABLE "payouts"
  ADD CONSTRAINT "payouts_amount" CHECK ("amount_piasters" > 0),
  ADD CONSTRAINT "payouts_period" CHECK ("period_end" >= "period_start");

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_rating" CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "users"
  ADD CONSTRAINT "users_phone_e164" CHECK ("phone" ~ '^\+[1-9][0-9]{7,14}$');

-- The ledger and the audit log are append-only: history is never rewritten.
CREATE FUNCTION "forbid_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "ledger_entries_append_only"
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();

CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();
