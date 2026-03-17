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

-- 2. Permisos sobre el schema público
-- GRANT CONNECT no es necesario: app_user es un rol sin login usado únicamente
-- como target de las políticas RLS. La app se conecta con POSTGRES_USER (superuser).
GRANT USAGE ON SCHEMA public TO app_user;

-- 3. Default privileges: cualquier tabla/secuencia/función creada por POSTGRES_USER
--    en el schema public será accesible por app_user automáticamente.
--    Esto evita tener que hacer GRANT manualmente después de cada migración.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO app_user;
