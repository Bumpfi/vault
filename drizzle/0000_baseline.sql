-- Baseline schema.
--
-- Written to be idempotent so it works in two situations:
--   * a fresh, empty database: creates everything;
--   * a database created before migrations were introduced (the schema used
--     to be synced with `drizzle-kit push`): adds whatever is missing, drops
--     columns the app no longer uses, and normalises constraint names.
-- Later schema changes are regular generated migrations (0001_…).

CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_setting" (
	"id" integer PRIMARY KEY NOT NULL,
	"registration_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "streamer" (
	"id" serial PRIMARY KEY NOT NULL,
	"twitch_user_id" text NOT NULL,
	"login" text NOT NULL,
	"display_name" text NOT NULL,
	"profile_image_url" text,
	"broadcaster_type" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "streamer_twitch_user_id_unique" UNIQUE("twitch_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"streamer_id" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"category" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_user_streamer_unq" UNIQUE("user_id","streamer_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_setting" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"default_category" text,
	"unwatched_default" boolean DEFAULT false NOT NULL,
	"theme" text,
	CONSTRAINT "user_setting_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vod" (
	"id" serial PRIMARY KEY NOT NULL,
	"twitch_video_id" text NOT NULL,
	"streamer_id" integer NOT NULL,
	"title" text NOT NULL,
	"thumbnail_url" text,
	"stream_id" text,
	"created_at_twitch" timestamp,
	"published_at" timestamp,
	"duration_seconds" integer,
	"is_available" boolean DEFAULT true NOT NULL,
	CONSTRAINT "vod_twitch_video_id_unique" UNIQUE("twitch_video_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watch_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"vod_id" integer NOT NULL,
	"position_seconds" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"watched" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "watch_progress_user_vod_unq" UNIQUE("user_id","vod_id")
);
--> statement-breakpoint

-- Columns added after the first release. Only columns that are nullable or
-- have a default can be added to tables that already contain rows.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "streamer" ADD COLUMN IF NOT EXISTS "broadcaster_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN IF NOT EXISTS "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN IF NOT EXISTS "category" text;--> statement-breakpoint
ALTER TABLE "user_setting" ADD COLUMN IF NOT EXISTS "default_category" text;--> statement-breakpoint
ALTER TABLE "user_setting" ADD COLUMN IF NOT EXISTS "unwatched_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_setting" ADD COLUMN IF NOT EXISTS "theme" text;--> statement-breakpoint
ALTER TABLE "vod" ADD COLUMN IF NOT EXISTS "stream_id" text;--> statement-breakpoint
ALTER TABLE "vod" ADD COLUMN IF NOT EXISTS "is_available" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD COLUMN IF NOT EXISTS "completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD COLUMN IF NOT EXISTS "watched" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Columns that were never read, or whose data moved elsewhere.
ALTER TABLE "streamer" DROP COLUMN IF EXISTS "retention_override";--> statement-breakpoint
ALTER TABLE "streamer" DROP COLUMN IF EXISTS "subscribed";--> statement-breakpoint
ALTER TABLE "vod" DROP COLUMN IF EXISTS "description";--> statement-breakpoint
ALTER TABLE "vod" DROP COLUMN IF EXISTS "url";--> statement-breakpoint
ALTER TABLE "vod" DROP COLUMN IF EXISTS "type";--> statement-breakpoint
ALTER TABLE "vod" DROP COLUMN IF EXISTS "estimated_expiry_at";--> statement-breakpoint
ALTER TABLE "vod" DROP COLUMN IF EXISTS "first_seen_at";--> statement-breakpoint
ALTER TABLE "vod" DROP COLUMN IF EXISTS "watched";--> statement-breakpoint
ALTER TABLE "watch_progress" DROP COLUMN IF EXISTS "duration_seconds";--> statement-breakpoint

-- Constraints that some databases have under Postgres' default names; give
-- them the names the schema expects so the guarded adds below don't create
-- duplicates.
DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_setting_user_id_fkey') THEN
		ALTER TABLE "user_setting" RENAME CONSTRAINT "user_setting_user_id_fkey" TO "user_setting_user_id_user_id_fk";
	END IF;
	IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_setting_user_id_key') THEN
		ALTER TABLE "user_setting" RENAME CONSTRAINT "user_setting_user_id_key" TO "user_setting_user_id_unique";
	END IF;
END $$;--> statement-breakpoint

-- Postgres has no "ADD CONSTRAINT IF NOT EXISTS", so each one is attempted
-- and the "already exists" error ignored.
DO $$ BEGIN
	ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_streamer_unq" UNIQUE("user_id","streamer_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "user_setting" ADD CONSTRAINT "user_setting_user_id_unique" UNIQUE("user_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_user_vod_unq" UNIQUE("user_id","vod_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "subscription" ADD CONSTRAINT "subscription_streamer_id_streamer_id_fk" FOREIGN KEY ("streamer_id") REFERENCES "public"."streamer"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "user_setting" ADD CONSTRAINT "user_setting_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "vod" ADD CONSTRAINT "vod_streamer_id_streamer_id_fk" FOREIGN KEY ("streamer_id") REFERENCES "public"."streamer"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_vod_id_vod_id_fk" FOREIGN KEY ("vod_id") REFERENCES "public"."vod"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_streamer_id_idx" ON "subscription" USING btree ("streamer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vod_streamer_id_idx" ON "vod" USING btree ("streamer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vod_published_at_idx" ON "vod" USING btree ("published_at");
