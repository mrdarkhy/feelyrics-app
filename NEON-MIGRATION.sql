CREATE TYPE "public"."request_channel" AS ENUM('direct', 'tt', 'ig', 'yt', 'x', 'rd', 'hn', 'other');--> statement-breakpoint
ALTER TABLE "song_requests" ADD COLUMN "channel" "request_channel" DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "song_requests" ADD COLUMN "ready_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "requests_channel_idx" ON "song_requests" USING btree ("channel","created_at");