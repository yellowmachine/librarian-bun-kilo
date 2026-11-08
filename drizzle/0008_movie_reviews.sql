CREATE TABLE "movie_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"movie_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rating" integer NOT NULL,
	"body" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "movie_reviews_rating_range" CHECK ("movie_reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "movie_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "movie_reviews" ADD CONSTRAINT "movie_reviews_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movie_reviews" ADD CONSTRAINT "movie_reviews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "movie_reviews_movie_user_idx" ON "movie_reviews" USING btree ("movie_id","user_id");--> statement-breakpoint
CREATE INDEX "movie_reviews_movie_idx" ON "movie_reviews" USING btree ("movie_id");--> statement-breakpoint
CREATE INDEX "movie_reviews_user_idx" ON "movie_reviews" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "movie_reviews_select" ON "movie_reviews" AS PERMISSIVE FOR SELECT TO "app_user" USING (true);--> statement-breakpoint
CREATE POLICY "movie_reviews_insert" ON "movie_reviews" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("movie_reviews"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "movie_reviews_update" ON "movie_reviews" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("movie_reviews"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "movie_reviews_delete" ON "movie_reviews" AS PERMISSIVE FOR DELETE TO "app_user" USING ("movie_reviews"."user_id" = current_setting('app.current_user_id', true));