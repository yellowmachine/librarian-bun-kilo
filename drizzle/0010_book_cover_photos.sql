ALTER TYPE "public"."ai_call_kind" ADD VALUE 'book_cover_scan';--> statement-breakpoint
ALTER TYPE "public"."ai_call_kind" ADD VALUE 'book_cover_compare';--> statement-breakpoint
CREATE TABLE "book_cover_photos" (
	"user_book_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "book_cover_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "book_cover_photos" ADD CONSTRAINT "book_cover_photos_user_book_id_user_books_id_fk" FOREIGN KEY ("user_book_id") REFERENCES "public"."user_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_cover_photos" ADD CONSTRAINT "book_cover_photos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "book_cover_photos_select" ON "book_cover_photos" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (select 1 from user_books ub where ub.id = "book_cover_photos"."user_book_id"));--> statement-breakpoint
CREATE POLICY "book_cover_photos_insert" ON "book_cover_photos" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("book_cover_photos"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "book_cover_photos_update" ON "book_cover_photos" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("book_cover_photos"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "book_cover_photos_delete" ON "book_cover_photos" AS PERMISSIVE FOR DELETE TO "app_user" USING ("book_cover_photos"."user_id" = current_setting('app.current_user_id', true));