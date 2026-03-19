CREATE TABLE "book_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"book_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rating" integer NOT NULL,
	"body" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "book_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "book_reviews" ADD CONSTRAINT "book_reviews_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_reviews" ADD CONSTRAINT "book_reviews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "book_reviews_book_user_idx" ON "book_reviews" USING btree ("book_id","user_id");--> statement-breakpoint
CREATE INDEX "book_reviews_book_idx" ON "book_reviews" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "book_reviews_user_idx" ON "book_reviews" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "book_reviews_select" ON "book_reviews" AS PERMISSIVE FOR SELECT TO "app_user" USING (true);--> statement-breakpoint
CREATE POLICY "book_reviews_insert" ON "book_reviews" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("book_reviews"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "book_reviews_update" ON "book_reviews" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("book_reviews"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "book_reviews_delete" ON "book_reviews" AS PERMISSIVE FOR DELETE TO "app_user" USING ("book_reviews"."user_id" = current_setting('app.current_user_id', true));