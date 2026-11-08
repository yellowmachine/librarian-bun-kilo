CREATE TABLE "movie_cover_photos" (
	"user_movie_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movie_cover_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "movie_cover_photos" ADD CONSTRAINT "movie_cover_photos_user_movie_id_user_movies_id_fk" FOREIGN KEY ("user_movie_id") REFERENCES "public"."user_movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movie_cover_photos" ADD CONSTRAINT "movie_cover_photos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "movie_cover_photos_all" ON "movie_cover_photos" AS PERMISSIVE FOR ALL TO "app_user" USING ("movie_cover_photos"."user_id" = current_setting('app.current_user_id', true)) WITH CHECK ("movie_cover_photos"."user_id" = current_setting('app.current_user_id', true));