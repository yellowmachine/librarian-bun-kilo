CREATE TABLE "librarian"."group_invite_codes" (
	"group_id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_invite_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "librarian"."group_invite_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "librarian"."groups" DROP CONSTRAINT "groups_invite_code_unique";--> statement-breakpoint
ALTER TABLE "librarian"."group_invite_codes" ADD CONSTRAINT "group_invite_codes_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "librarian"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "librarian"."groups" DROP COLUMN "invite_code";--> statement-breakpoint
CREATE POLICY "tags_select_in_group" ON "librarian"."tags" AS PERMISSIVE FOR SELECT TO "scholio_app" USING (exists (
				select 1 from "librarian".shared_tags st
				join "librarian".group_members gm on gm.group_id = st.group_id
				where st.tag_id = "librarian"."tags"."id"
				  and gm.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "user_book_tags_select_in_group" ON "librarian"."user_book_tags" AS PERMISSIVE FOR SELECT TO "scholio_app" USING (exists (
				select 1 from "librarian".shared_tags st
				join "librarian".group_members gm on gm.group_id = st.group_id
				where st.tag_id = "librarian"."user_book_tags"."tag_id"
				  and gm.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "user_books_select_in_group" ON "librarian"."user_books" AS PERMISSIVE FOR SELECT TO "scholio_app" USING (exists (
				select 1 from "librarian".user_book_tags ubt
				join "librarian".shared_tags st on st.tag_id = ubt.tag_id
				join "librarian".group_members gm on gm.group_id = st.group_id
				where ubt.user_book_id = "librarian"."user_books"."id"
				  and gm.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "group_invite_codes_select" ON "librarian"."group_invite_codes" AS PERMISSIVE FOR SELECT TO "scholio_app" USING (true);--> statement-breakpoint
CREATE POLICY "group_invite_codes_insert" ON "librarian"."group_invite_codes" AS PERMISSIVE FOR INSERT TO "scholio_app" WITH CHECK (exists (
        select 1 from "librarian".group_members gm
        where gm.group_id = "librarian"."group_invite_codes"."group_id"
          and gm.user_id = current_setting('app.current_user_id', true)
          and gm.role in ('owner', 'admin')
      ));--> statement-breakpoint
CREATE POLICY "group_invite_codes_update" ON "librarian"."group_invite_codes" AS PERMISSIVE FOR UPDATE TO "scholio_app" USING (exists (
        select 1 from "librarian".group_members gm
        where gm.group_id = "librarian"."group_invite_codes"."group_id"
          and gm.user_id = current_setting('app.current_user_id', true)
          and gm.role in ('owner', 'admin')
      ));--> statement-breakpoint
CREATE POLICY "group_invite_codes_delete" ON "librarian"."group_invite_codes" AS PERMISSIVE FOR DELETE TO "scholio_app" USING (exists (
        select 1 from "librarian".group_members gm
        where gm.group_id = "librarian"."group_invite_codes"."group_id"
          and gm.user_id = current_setting('app.current_user_id', true)
          and gm.role in ('owner', 'admin')
      ));--> statement-breakpoint
ALTER POLICY "user_book_tags_select" ON "librarian"."user_book_tags" TO scholio_app USING (exists (
				select 1 from "librarian".tags t
				where t.id = "librarian"."user_book_tags"."tag_id"
				  and t.user_id = current_setting('app.current_user_id', true)
			));