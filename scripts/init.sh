#!/bin/bash
# Ejecutado por Postgres al inicializar el volumen por primera vez
# (docker-entrypoint-initdb.d), como el superusuario POSTGRES_USER.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	-- app_user: el rol con el que se conecta la app (DATABASE_URL). Ni superuser
	-- ni dueño de las tablas, así que las políticas RLS se le aplican siempre.
	-- Las migraciones (tablas, políticas, funciones) corren como POSTGRES_USER
	-- vía MIGRATION_DATABASE_URL. El nombre está fijo: lo nombran las políticas.
	CREATE ROLE app_user WITH LOGIN PASSWORD '${APP_DB_PASSWORD}';

	GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO app_user;
	GRANT USAGE ON SCHEMA public TO app_user;

	ALTER DEFAULT PRIVILEGES IN SCHEMA public
		GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

	ALTER DEFAULT PRIVILEGES IN SCHEMA public
		GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_user;
EOSQL
