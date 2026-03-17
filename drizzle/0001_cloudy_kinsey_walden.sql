CREATE ROLE "app_user";--> statement-breakpoint
ALTER TABLE "books" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "loans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shared_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_book_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_books" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "books_select" ON "books" AS PERMISSIVE FOR SELECT TO "app_user" USING (true);--> statement-breakpoint
CREATE POLICY "books_insert" ON "books" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "books_update" ON "books" AS PERMISSIVE FOR UPDATE TO "app_user" USING (true);--> statement-breakpoint
CREATE POLICY "group_members_select" ON "group_members" AS PERMISSIVE FOR SELECT TO "app_user" USING ("group_members"."user_id" = current_setting('app.current_user_id', true)
				or exists (
					select 1 from group_members gm2
					where gm2.group_id = "group_members"."group_id"
					  and gm2.user_id = current_setting('app.current_user_id', true)
				));--> statement-breakpoint
CREATE POLICY "group_members_insert" ON "group_members" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("group_members"."user_id" = current_setting('app.current_user_id', true)
				or exists (
					select 1 from group_members gm
					where gm.group_id = "group_members"."group_id"
					  and gm.user_id = current_setting('app.current_user_id', true)
					  and gm.role in ('owner', 'admin')
				));--> statement-breakpoint
CREATE POLICY "group_members_delete" ON "group_members" AS PERMISSIVE FOR DELETE TO "app_user" USING ("group_members"."user_id" = current_setting('app.current_user_id', true)
				or exists (
					select 1 from group_members gm
					where gm.group_id = "group_members"."group_id"
					  and gm.user_id = current_setting('app.current_user_id', true)
					  and gm.role in ('owner', 'admin')
				));--> statement-breakpoint
CREATE POLICY "groups_select" ON "groups" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (
				select 1 from group_members gm
				where gm.group_id = "groups"."id"
				  and gm.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "groups_insert" ON "groups" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("groups"."created_by" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "groups_update" ON "groups" AS PERMISSIVE FOR UPDATE TO "app_user" USING (exists (
				select 1 from group_members gm
				where gm.group_id = "groups"."id"
				  and gm.user_id = current_setting('app.current_user_id', true)
				  and gm.role in ('owner', 'admin')
			));--> statement-breakpoint
CREATE POLICY "groups_delete" ON "groups" AS PERMISSIVE FOR DELETE TO "app_user" USING (exists (
				select 1 from group_members gm
				where gm.group_id = "groups"."id"
				  and gm.user_id = current_setting('app.current_user_id', true)
				  and gm.role = 'owner'
			));--> statement-breakpoint
CREATE POLICY "loans_select" ON "loans" AS PERMISSIVE FOR SELECT TO "app_user" USING ("loans"."owner_id" = current_setting('app.current_user_id', true)
				or "loans"."borrower_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "loans_insert" ON "loans" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("loans"."borrower_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "loans_update" ON "loans" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("loans"."owner_id" = current_setting('app.current_user_id', true)
				or "loans"."borrower_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "loans_delete" ON "loans" AS PERMISSIVE FOR DELETE TO "app_user" USING ("loans"."borrower_id" = current_setting('app.current_user_id', true)
				and "loans"."status" = 'requested');--> statement-breakpoint
CREATE POLICY "shared_tags_select" ON "shared_tags" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (
				select 1 from group_members gm
				where gm.group_id = "shared_tags"."group_id"
				  and gm.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "shared_tags_insert" ON "shared_tags" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("shared_tags"."shared_by" = current_setting('app.current_user_id', true)
				and exists (
					select 1 from group_members gm
					where gm.group_id = "shared_tags"."group_id"
					  and gm.user_id = current_setting('app.current_user_id', true)
				));--> statement-breakpoint
CREATE POLICY "shared_tags_delete" ON "shared_tags" AS PERMISSIVE FOR DELETE TO "app_user" USING ("shared_tags"."shared_by" = current_setting('app.current_user_id', true)
				or exists (
					select 1 from group_members gm
					where gm.group_id = "shared_tags"."group_id"
					  and gm.user_id = current_setting('app.current_user_id', true)
					  and gm.role in ('owner', 'admin')
				));--> statement-breakpoint
CREATE POLICY "tags_select" ON "tags" AS PERMISSIVE FOR SELECT TO "app_user" USING ("tags"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "tags_insert" ON "tags" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("tags"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "tags_update" ON "tags" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("tags"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "tags_delete" ON "tags" AS PERMISSIVE FOR DELETE TO "app_user" USING ("tags"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "user_book_tags_select" ON "user_book_tags" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (
				select 1 from user_books ub
				where ub.id = "user_book_tags"."user_book_id"
				  and ub.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "user_book_tags_insert" ON "user_book_tags" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (exists (
				select 1 from user_books ub
				where ub.id = "user_book_tags"."user_book_id"
				  and ub.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "user_book_tags_delete" ON "user_book_tags" AS PERMISSIVE FOR DELETE TO "app_user" USING (exists (
				select 1 from user_books ub
				where ub.id = "user_book_tags"."user_book_id"
				  and ub.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "user_books_select" ON "user_books" AS PERMISSIVE FOR SELECT TO "app_user" USING ("user_books"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "user_books_insert" ON "user_books" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("user_books"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "user_books_update" ON "user_books" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("user_books"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "user_books_delete" ON "user_books" AS PERMISSIVE FOR DELETE TO "app_user" USING ("user_books"."user_id" = current_setting('app.current_user_id', true));