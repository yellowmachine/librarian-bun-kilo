ALTER POLICY "group_members_delete" ON "librarian"."group_members" TO scholio_app USING ("librarian"."group_members"."user_id" = current_setting('app.current_user_id', true) or exists (
        select 1 from "librarian".group_members gm
        where gm.group_id = "librarian"."group_members"."group_id"
          and gm.user_id = current_setting('app.current_user_id', true)
          and gm.role in ('owner', 'admin')
      ));