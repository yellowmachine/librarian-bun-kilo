-- Si una copia de película es del usuario, saltándose la RLS de user_movies
-- (ver ownsUserMovie en schema.ts): la política de inserción de
-- user_movie_tags no puede leer user_movies directamente, porque la de grupos
-- de user_movies lee user_movie_tags y Postgres lo rechaza por recursión.
CREATE FUNCTION owns_user_movie(p_user_movie_id text, p_user_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_movies
        WHERE id = p_user_movie_id AND user_id = p_user_id
    );
END;
$$;
--> statement-breakpoint
CREATE TABLE "user_movie_tags" (
	"user_movie_id" text NOT NULL,
	"tag_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_movie_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_movie_tags" ADD CONSTRAINT "user_movie_tags_user_movie_id_user_movies_id_fk" FOREIGN KEY ("user_movie_id") REFERENCES "public"."user_movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_movie_tags" ADD CONSTRAINT "user_movie_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_movie_tags_pk" ON "user_movie_tags" USING btree ("user_movie_id","tag_id");--> statement-breakpoint
CREATE INDEX "user_movie_tags_tag_idx" ON "user_movie_tags" USING btree ("tag_id");--> statement-breakpoint
DROP POLICY "movie_cover_photos_all" ON "movie_cover_photos" CASCADE;--> statement-breakpoint
CREATE POLICY "user_movies_select_in_group" ON "user_movies" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (
				select 1 from user_movie_tags umt
				join shared_tags st on st.tag_id = umt.tag_id
				join group_members gm on gm.group_id = st.group_id
				where umt.user_movie_id = "user_movies"."id"
				  and gm.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "user_movie_tags_select" ON "user_movie_tags" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (
				select 1 from tags t
				where t.id = "user_movie_tags"."tag_id"
				  and t.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "user_movie_tags_select_in_group" ON "user_movie_tags" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (
				select 1 from shared_tags st
				join group_members gm on gm.group_id = st.group_id
				where st.tag_id = "user_movie_tags"."tag_id"
				  and gm.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "user_movie_tags_insert" ON "user_movie_tags" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (exists (
				select 1 from tags t
				where t.id = "user_movie_tags"."tag_id"
				  and t.user_id = current_setting('app.current_user_id', true)
			) and owns_user_movie("user_movie_tags"."user_movie_id", current_setting('app.current_user_id', true)));--> statement-breakpoint
CREATE POLICY "user_movie_tags_delete" ON "user_movie_tags" AS PERMISSIVE FOR DELETE TO "app_user" USING (exists (
				select 1 from tags t
				where t.id = "user_movie_tags"."tag_id"
				  and t.user_id = current_setting('app.current_user_id', true)
			));--> statement-breakpoint
CREATE POLICY "movie_cover_photos_select" ON "movie_cover_photos" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (select 1 from user_movies um where um.id = "movie_cover_photos"."user_movie_id"));--> statement-breakpoint
CREATE POLICY "movie_cover_photos_insert" ON "movie_cover_photos" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("movie_cover_photos"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "movie_cover_photos_update" ON "movie_cover_photos" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("movie_cover_photos"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "movie_cover_photos_delete" ON "movie_cover_photos" AS PERMISSIVE FOR DELETE TO "app_user" USING ("movie_cover_photos"."user_id" = current_setting('app.current_user_id', true));
