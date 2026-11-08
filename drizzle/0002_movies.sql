CREATE TYPE "public"."media_format" AS ENUM('dvd', 'bluray', 'uhd_bluray');--> statement-breakpoint
CREATE TABLE "movies" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"original_title" text,
	"release_year" integer,
	"directors" text[],
	"runtime" integer,
	"genres" text[],
	"overview" text,
	"poster_url" text,
	"tmdb_data" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_movies" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"library_id" text NOT NULL,
	"movie_id" text,
	"title" text,
	"original_title" text,
	"directors" text[],
	"release_year" integer,
	"overview" text,
	"cover_url" text,
	"format" "media_format" NOT NULL,
	"edition" text,
	"notes" text,
	"is_available" boolean DEFAULT true NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_movies_movie_or_title" CHECK ("user_movies"."movie_id" IS NOT NULL OR "user_movies"."title" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "user_movies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_movies" ADD CONSTRAINT "user_movies_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_movies" ADD CONSTRAINT "user_movies_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_movies" ADD CONSTRAINT "user_movies_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_movies_user_idx" ON "user_movies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_movies_movie_idx" ON "user_movies" USING btree ("movie_id");--> statement-breakpoint
CREATE INDEX "user_movies_library_idx" ON "user_movies" USING btree ("library_id");--> statement-breakpoint
CREATE POLICY "movies_select" ON "movies" AS PERMISSIVE FOR SELECT TO "app_user" USING (true);--> statement-breakpoint
CREATE POLICY "movies_insert" ON "movies" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "movies_update" ON "movies" AS PERMISSIVE FOR UPDATE TO "app_user" USING (true);--> statement-breakpoint
CREATE POLICY "user_movies_select" ON "user_movies" AS PERMISSIVE FOR SELECT TO "app_user" USING ("user_movies"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "user_movies_insert" ON "user_movies" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("user_movies"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "user_movies_update" ON "user_movies" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("user_movies"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "user_movies_delete" ON "user_movies" AS PERMISSIVE FOR DELETE TO "app_user" USING ("user_movies"."user_id" = current_setting('app.current_user_id', true));