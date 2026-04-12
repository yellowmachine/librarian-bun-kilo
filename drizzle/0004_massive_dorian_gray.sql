CREATE POLICY "user_books_select_on_loan" ON "librarian"."user_books" AS PERMISSIVE FOR SELECT TO "scholio_app" USING (exists (
				select 1 from "librarian".loans l
				where l.user_book_id = "librarian"."user_books"."id"
				  and l.borrower_id = current_setting('app.current_user_id', true)
				  and l.status not in ('returned', 'rejected', 'cancelled')
			));