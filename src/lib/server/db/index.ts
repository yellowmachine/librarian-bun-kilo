import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

// Todo vive en public. Fijado para que no dependa del search_path por defecto
// ("$user", public): un esquema con el nombre del rol se llevaría las tablas.
const client = postgres(env.DATABASE_URL, { connection: { search_path: 'public' } });

export const db = drizzle(client, { schema });
