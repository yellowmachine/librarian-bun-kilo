-- init.sql — Ejecutado por PostgreSQL al inicializar el contenedor por primera vez.
-- Se monta en /docker-entrypoint-initdb.d/ y corre con el usuario superuser (POSTGRES_USER).
--
-- Objetivo: dejar la base de datos lista para que las migraciones de Drizzle
-- funcionen a la primera sin intervención manual.
--
-- Arquitectura multi-app:
--   - scholio.*   → tablas de Scholio (gestionadas por Scholio)
--   - librarian.* → tablas de Librarian (gestionadas por Librarian)
--   - public.*    → tablas de better-auth compartidas (user, session, etc.)
--
-- El rol 'scholio_app' es creado por Scholio y compartido entre ambas apps.
-- Librarian necesita que ese rol tenga acceso a librarian.* para que RLS funcione.
--
-- NOTA: Este script corre UNA SOLA VEZ, cuando el volumen de datos está vacío.
-- Si necesitas re-ejecutarlo, borra el volumen Docker primero.

-- 1. Schemas
-- 'public'    → tablas de better-auth (user, session, account, verification)
-- 'librarian' → tablas de la app Librarian (books, user_books, groups, etc.)
CREATE SCHEMA IF NOT EXISTS librarian;

-- 2. El rol scholio_app es compartido con Scholio.
--    Si este init corre antes que el de Scholio, lo creamos aquí; si ya existe, no falla.
DO $$ BEGIN
    CREATE ROLE scholio_app;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Permisos sobre los schemas
GRANT USAGE ON SCHEMA public TO scholio_app;
GRANT USAGE ON SCHEMA librarian TO scholio_app;

-- 4. Default privileges: cualquier tabla/secuencia/función creada por POSTGRES_USER
--    en estos schemas será accesible por scholio_app automáticamente.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO scholio_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO scholio_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO scholio_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA librarian
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO scholio_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA librarian
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO scholio_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA librarian
    GRANT EXECUTE ON FUNCTIONS TO scholio_app;

-- 5. search_path para scholio_app: librarian primero, public como fallback para
--    las tablas de better-auth. withRLS también lo setea con SET LOCAL por seguridad.
ALTER ROLE scholio_app SET search_path = librarian, public;
