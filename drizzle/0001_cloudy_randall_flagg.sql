ALTER POLICY "group_members_insert" ON "group_members" TO app_user WITH CHECK (exists (
					select 1 from group_members gm
					where gm.group_id = "group_members"."group_id"
					  and gm.user_id = current_setting('app.current_user_id', true)
					  and gm.role in ('owner', 'admin')
				));