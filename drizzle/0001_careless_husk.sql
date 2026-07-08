CREATE TABLE "librarian"."libraries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "librarian"."libraries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "librarian"."user_books" ADD COLUMN "library_id" text;--> statement-breakpoint
ALTER TABLE "librarian"."libraries" ADD CONSTRAINT "libraries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "libraries_user_default_idx" ON "librarian"."libraries" USING btree ("user_id") WHERE "librarian"."libraries"."is_default" = true;--> statement-breakpoint
CREATE INDEX "libraries_user_idx" ON "librarian"."libraries" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "librarian"."user_books" ADD CONSTRAINT "user_books_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "librarian"."libraries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_books_library_idx" ON "librarian"."user_books" USING btree ("library_id");--> statement-breakpoint
CREATE POLICY "libraries_select" ON "librarian"."libraries" AS PERMISSIVE FOR SELECT TO "scholio_app" USING ("librarian"."libraries"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "libraries_insert" ON "librarian"."libraries" AS PERMISSIVE FOR INSERT TO "scholio_app" WITH CHECK ("librarian"."libraries"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "libraries_update" ON "librarian"."libraries" AS PERMISSIVE FOR UPDATE TO "scholio_app" USING ("librarian"."libraries"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "libraries_delete" ON "librarian"."libraries" AS PERMISSIVE FOR DELETE TO "scholio_app" USING ("librarian"."libraries"."user_id" = current_setting('app.current_user_id', true) and not "librarian"."libraries"."is_default");