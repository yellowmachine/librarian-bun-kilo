-- Funciones SECURITY DEFINER para evitar recursión auto-referencial en políticas RLS de group_members.
-- Corren como su propietario (superuser), por lo que no aplican RLS al consultar group_members.
CREATE OR REPLACE FUNCTION "librarian".is_group_member(p_group_id text, p_user_id text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = librarian AS
$$ SELECT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = p_user_id) $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "librarian".is_group_admin(p_group_id text, p_user_id text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = librarian AS
$$ SELECT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = p_user_id AND role IN ('owner', 'admin')) $$;
--> statement-breakpoint
ALTER POLICY "group_invite_codes_insert" ON "librarian"."group_invite_codes" TO scholio_app WITH CHECK ("librarian".is_group_admin("librarian"."group_invite_codes"."group_id", current_setting('app.current_user_id', true)));--> statement-breakpoint
ALTER POLICY "group_invite_codes_update" ON "librarian"."group_invite_codes" TO scholio_app USING ("librarian".is_group_admin("librarian"."group_invite_codes"."group_id", current_setting('app.current_user_id', true)));--> statement-breakpoint
ALTER POLICY "group_invite_codes_delete" ON "librarian"."group_invite_codes" TO scholio_app USING ("librarian".is_group_admin("librarian"."group_invite_codes"."group_id", current_setting('app.current_user_id', true)));--> statement-breakpoint
ALTER POLICY "group_members_select" ON "librarian"."group_members" TO scholio_app USING ("librarian"."group_members"."user_id" = current_setting('app.current_user_id', true) or "librarian".is_group_member("librarian"."group_members"."group_id", current_setting('app.current_user_id', true)));--> statement-breakpoint
ALTER POLICY "group_members_delete" ON "librarian"."group_members" TO scholio_app USING ("librarian"."group_members"."user_id" = current_setting('app.current_user_id', true) or "librarian".is_group_admin("librarian"."group_members"."group_id", current_setting('app.current_user_id', true)));--> statement-breakpoint
ALTER POLICY "groups_select" ON "librarian"."groups" TO scholio_app USING ("librarian".is_group_member("librarian"."groups"."id", current_setting('app.current_user_id', true)));--> statement-breakpoint
ALTER POLICY "groups_update" ON "librarian"."groups" TO scholio_app USING ("librarian".is_group_admin("librarian"."groups"."id", current_setting('app.current_user_id', true)));--> statement-breakpoint
ALTER POLICY "groups_delete" ON "librarian"."groups" TO scholio_app USING ("librarian".is_group_admin("librarian"."groups"."id", current_setting('app.current_user_id', true)));--> statement-breakpoint
ALTER POLICY "shared_tags_select" ON "librarian"."shared_tags" TO scholio_app USING ("librarian".is_group_member("librarian"."shared_tags"."group_id", current_setting('app.current_user_id', true)));--> statement-breakpoint
ALTER POLICY "shared_tags_insert" ON "librarian"."shared_tags" TO scholio_app WITH CHECK ("librarian"."shared_tags"."shared_by" = current_setting('app.current_user_id', true) and "librarian".is_group_member("librarian"."shared_tags"."group_id", current_setting('app.current_user_id', true)));--> statement-breakpoint
ALTER POLICY "shared_tags_delete" ON "librarian"."shared_tags" TO scholio_app USING ("librarian"."shared_tags"."shared_by" = current_setting('app.current_user_id', true) or "librarian".is_group_admin("librarian"."shared_tags"."group_id", current_setting('app.current_user_id', true)));
