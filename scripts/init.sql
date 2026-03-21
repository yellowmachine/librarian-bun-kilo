-- init.sql — Ejecutado por PostgreSQL al inicializar el contenedor por primera vez.
-- Se monta en /docker-entrypoint-initdb.d/ y corre con el usuario superuser (POSTGRES_USER).
--
-- Objetivo: dejar la base de datos lista para que las migraciones de Drizzle
-- funcionen a la primera sin intervención manual.
--
-- ¿Qué hace?
--   1. Crea el rol app_user (sin login) que usan las políticas RLS.
--   2. Otorga permisos de conexión y uso del schema al rol.
--   3. Configura default privileges para que tablas y secuencias creadas en el
--      futuro (por las migraciones) sean accesibles por app_user automáticamente.
--
-- NOTA: Este script corre UNA SOLA VEZ, cuando el volumen de datos está vacío.
-- Si necesitas re-ejecutarlo, borra el volumen Docker primero.

-- 1. Rol de la aplicación (sin contraseña, sin login — se usa vía SET ROLE o políticas RLS)
CREATE ROLE app_user;

-- 2. Schemas
-- 'public'    → tablas de better-auth (user, session, account, verification)
-- 'librarian' → tablas de la app Librarian (books, user_books, groups, etc.)
CREATE SCHEMA librarian;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT USAGE ON SCHEMA librarian TO app_user;

-- 3. Default privileges: cualquier tabla/secuencia/función creada por POSTGRES_USER
--    en estos schemas será accesible por app_user automáticamente.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA librarian
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA librarian
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA librarian
    GRANT EXECUTE ON FUNCTIONS TO app_user;

-- 4. search_path para app_user: las políticas RLS usan nombres sin schema (ej: 'user_books').
--    Con librarian primero se resuelven a librarian.user_books; public como fallback
--    para las tablas de better-auth (user, session, etc.).
ALTER ROLE app_user SET search_path = librarian, public;
