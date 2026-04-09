ALTER POLICY "user_book_tags_insert" ON "librarian"."user_book_tags" TO scholio_app WITH CHECK (exists (
				select 1 from "librarian".tags t
				where t.id = "librarian"."user_book_tags"."tag_id"
				  and t.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
ALTER POLICY "user_book_tags_delete" ON "librarian"."user_book_tags" TO scholio_app USING (exists (
				select 1 from "librarian".tags t
				where t.id = "librarian"."user_book_tags"."tag_id"
				  and t.user_id = current_setting('app.current_user_id', true)
			));
