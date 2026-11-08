CREATE TYPE "public"."loan_item_kind" AS ENUM('book', 'movie');--> statement-breakpoint
ALTER TABLE "loans" DROP CONSTRAINT "loans_one_item";--> statement-breakpoint
ALTER TABLE "loans" DROP CONSTRAINT "loans_user_book_id_user_books_id_fk";
--> statement-breakpoint
ALTER TABLE "loans" DROP CONSTRAINT "loans_user_movie_id_user_movies_id_fk";
--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "item_kind" "loan_item_kind";--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "item_title" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "item_creators" text[];--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "item_cover_url" text;--> statement-breakpoint
-- Los préstamos que ya hay: qué son y su foto fija, sacada de la copia actual.
-- Solo portadas públicas (https): la foto propia de una película
-- (/api/movies/…/cover) desaparece con ella.
UPDATE "loans" SET "item_kind" = CASE WHEN "user_movie_id" IS NOT NULL THEN 'movie' ELSE 'book' END::"loan_item_kind";--> statement-breakpoint
UPDATE "loans" l SET
	"item_title" = COALESCE(ub."title", b."title"),
	"item_creators" = COALESCE(ub."authors", b."authors"),
	"item_cover_url" = NULLIF(COALESCE(ub."cover_url", b."cover_url"), '')
FROM "user_books" ub LEFT JOIN "books" b ON b."id" = ub."book_id"
WHERE ub."id" = l."user_book_id";--> statement-breakpoint
UPDATE "loans" l SET
	"item_title" = COALESCE(um."title", m."title"),
	"item_creators" = COALESCE(um."directors", m."directors"),
	"item_cover_url" = COALESCE(um."cover_url", m."poster_url")
FROM "user_movies" um LEFT JOIN "movies" m ON m."id" = um."movie_id"
WHERE um."id" = l."user_movie_id";--> statement-breakpoint
UPDATE "loans" SET "item_cover_url" = NULL WHERE "item_cover_url" NOT LIKE 'https://%';--> statement-breakpoint
UPDATE "loans" SET "item_title" = '?' WHERE "item_title" IS NULL;--> statement-breakpoint
ALTER TABLE "loans" ALTER COLUMN "item_kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "loans" ALTER COLUMN "item_title" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_user_book_id_user_books_id_fk" FOREIGN KEY ("user_book_id") REFERENCES "public"."user_books"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_user_movie_id_user_movies_id_fk" FOREIGN KEY ("user_movie_id") REFERENCES "public"."user_movies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_item_matches_kind" CHECK (("loans"."item_kind" = 'book' and "loans"."user_movie_id" is null)
				or ("loans"."item_kind" = 'movie' and "loans"."user_book_id" is null));