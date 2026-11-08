CREATE TYPE "public"."ai_call_kind" AS ENUM('book_shelf_scan', 'movie_scan', 'book_tags', 'movie_tags', 'book_cover_search');--> statement-breakpoint
CREATE TABLE "ai_usage_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" "ai_call_kind" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"subject" text,
	"result_count" integer,
	"success" boolean NOT NULL,
	"error" text,
	"model" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"cost_usd" double precision,
	"duration_ms" integer,
	"generation_id" text
);
--> statement-breakpoint
ALTER TABLE "ai_usage_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_log_user_date_idx" ON "ai_usage_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE POLICY "ai_usage_log_select" ON "ai_usage_log" AS PERMISSIVE FOR SELECT TO "app_user" USING ("ai_usage_log"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "ai_usage_log_insert" ON "ai_usage_log" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("ai_usage_log"."user_id" = current_setting('app.current_user_id', true));