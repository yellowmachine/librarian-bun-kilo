ALTER TABLE "loans" ALTER COLUMN "user_book_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "user_movie_id" text;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_user_movie_id_user_movies_id_fk" FOREIGN KEY ("user_movie_id") REFERENCES "public"."user_movies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loans_user_movie_idx" ON "loans" USING btree ("user_movie_id");--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_one_item" CHECK (num_nonnulls("loans"."user_book_id", "loans"."user_movie_id") = 1);--> statement-breakpoint
CREATE POLICY "user_movies_select_on_loan" ON "user_movies" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (
				select 1 from loans l
				where l.user_movie_id = "user_movies"."id"
				  and l.borrower_id = current_setting('app.current_user_id', true)
			));