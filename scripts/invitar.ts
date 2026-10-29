#!/usr/bin/env bun
// Invita a alguien a mano e imprime el enlace, por si el correo no llega:
//   bun run invitar ana@example.com
// En producción, desde la terminal del contenedor: bun scripts/invitar.ts ana@example.com
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { invitationStore } from '../src/lib/server/invitation-store';

const email = process.argv[2];
const url = process.env.DATABASE_URL;
const origin = process.env.ORIGIN;

if (!email || !url || !origin) {
	console.error('Uso: bun run invitar <email>   (con DATABASE_URL y ORIGIN en el entorno)');
	process.exit(1);
}

const client = postgres(url, { max: 1, connection: { search_path: 'public' } });
try {
	const made = await invitationStore(drizzle(client)).invite(email, null);
	if (!made.ok) {
		console.error(made.problem);
		process.exitCode = 1;
	} else {
		console.log(`${origin}/invitacion/${made.token}`);
	}
} finally {
	await client.end();
}
