ALTER POLICY "user_books_select_on_loan" ON "librarian"."user_books" TO scholio_app USING (exists (
				select 1 from "librarian".loans l
				where l.user_book_id = "librarian"."user_books"."id"
				  and l.borrower_id = current_setting('app.current_user_id', true)
			));