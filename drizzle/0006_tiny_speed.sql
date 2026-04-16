DROP INDEX "librarian"."user_books_user_book_idx";--> statement-breakpoint
ALTER TABLE "librarian"."user_books" ALTER COLUMN "book_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "librarian"."user_books" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "librarian"."user_books" ADD COLUMN "authors" text[];--> statement-breakpoint
ALTER TABLE "librarian"."user_books" ADD COLUMN "isbn" text;--> statement-breakpoint
ALTER TABLE "librarian"."user_books" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "librarian"."user_books" ADD COLUMN "publish_year" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "user_books_user_book_idx" ON "librarian"."user_books" USING btree ("user_id","book_id") WHERE "librarian"."user_books"."book_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "librarian"."user_books" ADD CONSTRAINT "user_books_book_or_title" CHECK ("librarian"."user_books"."book_id" IS NOT NULL OR "librarian"."user_books"."title" IS NOT NULL);