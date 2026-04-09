import type { User, Session } from 'better-auth/minimal';
import type { db } from '$lib/server/db';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: User;
			session?: Session;
			hasLibrarianProfile?: boolean;
			withRLS: <T>(fn: (tx: typeof db) => Promise<T>) => Promise<T>;
		}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
