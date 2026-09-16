CREATE TYPE "public"."language_code" AS ENUM('en', 'tr', 'es', 'pt-br', 'it', 'fr', 'de', 'nap');--> statement-breakpoint
CREATE TYPE "public"."lyrics_provenance" AS ENUM('user-paste', 'public-domain', 'licensed');--> statement-breakpoint
CREATE TYPE "public"."reason_tag" AS ENUM('feel', 'register', 'metaphor', 'prosody', 'cultural-code', 'literal-wins', 'form-embedded', 'sung-order', 'onomatopoeia', 'idiom-twin', 'false-friend');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('lyrics-needed', 'queued', 'ready', 'declined');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('proposed', 'accepted', 'disputed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."target_language" AS ENUM('tr', 'en', 'es', 'pt-br');--> statement-breakpoint
CREATE TABLE "feel_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid,
	"line_id" uuid,
	"pair" text NOT NULL,
	"original_line" text NOT NULL,
	"engine_draft" text NOT NULL,
	"human_rendering" text NOT NULL,
	"tags" "reason_tag"[] DEFAULT '{}' NOT NULL,
	"validator" text NOT NULL,
	"source" text NOT NULL,
	"review_note" text,
	"terms_version" text DEFAULT '1.0' NOT NULL,
	"metadata" jsonb,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"original" text NOT NULL,
	"rendering" text NOT NULL,
	"note" text,
	"tags" "reason_tag"[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket_key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"targets" "target_language"[] NOT NULL,
	"requester_alias" text,
	"has_lyrics" boolean DEFAULT false NOT NULL,
	"status" "request_status" DEFAULT 'lyrics-needed' NOT NULL,
	"song_slug" text,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"source_language" "language_code" NOT NULL,
	"target_language" "target_language" NOT NULL,
	"engine_version" text DEFAULT '0.1.1' NOT NULL,
	"feel_profile" text,
	"provenance" "lyrics_provenance" NOT NULL,
	"requested_by" text,
	"validated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"original_line" text NOT NULL,
	"engine_draft" text NOT NULL,
	"proposed_rendering" text NOT NULL,
	"tags" "reason_tag"[] NOT NULL,
	"comment" text,
	"contributor_alias" text,
	"status" "suggestion_status" DEFAULT 'proposed' NOT NULL,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "feel_validations" ADD CONSTRAINT "feel_validations_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feel_validations" ADD CONSTRAINT "feel_validations_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lines" ADD CONSTRAINT "lines_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "validations_song_idx" ON "feel_validations" USING btree ("song_id","recorded_at");--> statement-breakpoint
CREATE INDEX "lines_section_idx" ON "lines" USING btree ("section_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "lines_section_position_key" ON "lines" USING btree ("section_id","position");--> statement-breakpoint
CREATE INDEX "rate_limit_bucket_idx" ON "rate_limit_events" USING btree ("bucket_key","occurred_at");--> statement-breakpoint
CREATE INDEX "sections_song_idx" ON "sections" USING btree ("song_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "sections_song_position_key" ON "sections" USING btree ("song_id","position");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "song_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "requests_dedupe_idx" ON "song_requests" USING btree ("dedupe_key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "songs_slug_key" ON "songs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "songs_pair_idx" ON "songs" USING btree ("source_language","target_language");--> statement-breakpoint
CREATE INDEX "songs_updated_idx" ON "songs" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "suggestions_song_idx" ON "suggestions" USING btree ("song_id","created_at");--> statement-breakpoint
CREATE INDEX "suggestions_line_idx" ON "suggestions" USING btree ("line_id","created_at");--> statement-breakpoint
CREATE INDEX "suggestions_status_idx" ON "suggestions" USING btree ("status","created_at");