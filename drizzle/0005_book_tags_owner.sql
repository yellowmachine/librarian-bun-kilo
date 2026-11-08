-- Si una copia de libro es del usuario, saltándose la RLS de user_books (ver
-- ownsUserBook en schema.ts). La usa la política de inserción de
-- user_book_tags, que antes solo exigía que la etiqueta fuera propia.
CREATE FUNCTION owns_user_book(p_user_book_id text, p_user_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_books
        WHERE id = p_user_book_id AND user_id = p_user_id
    );
END;
$$;
--> statement-breakpoint
-- Etiquetas puestas en libros ajenos mientras la política lo permitía: la app
-- nunca las crea a propósito (solo ofrece tus etiquetas en tus libros), y son
-- justo las que exponían un libro a grupos que su dueño no eligió.
DELETE FROM user_book_tags ubt
USING tags t, user_books ub
WHERE t.id = ubt.tag_id
  AND ub.id = ubt.user_book_id
  AND t.user_id <> ub.user_id;
--> statement-breakpoint
ALTER POLICY "user_book_tags_insert" ON "user_book_tags" TO app_user WITH CHECK (exists (
				select 1 from tags t
				where t.id = "user_book_tags"."tag_id"
				  and t.user_id = current_setting('app.current_user_id', true)
			) and owns_user_book("user_book_tags"."user_book_id", current_setting('app.current_user_id', true)));