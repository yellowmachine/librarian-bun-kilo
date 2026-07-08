-- Crea una biblioteca "Default" para cada usuario que ya tenga libros y les
-- faltaba library_id (la columna se agregó nullable en la migración anterior).
-- Es idempotente: solo toca usuarios con user_books.library_id IS NULL, así que
-- puede re-ejecutarse sin duplicar bibliotecas si alguna vez se interrumpe.
INSERT INTO "librarian"."libraries" (id, user_id, name, is_default, created_at, updated_at)
SELECT gen_random_uuid()::text, sub.user_id, 'Default', true, now(), now()
FROM (
	SELECT DISTINCT user_id
	FROM "librarian"."user_books"
	WHERE library_id IS NULL
) sub;
--> statement-breakpoint
UPDATE "librarian"."user_books" ub
SET library_id = l.id
FROM "librarian"."libraries" l
WHERE ub.library_id IS NULL
  AND l.user_id = ub.user_id
  AND l.is_default = true;
