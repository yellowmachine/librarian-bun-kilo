import { db } from './index';
import { sql } from 'drizzle-orm';

/**
 * Ejecuta un callback dentro de una transacción con el user_id seteado
 * en la variable de sesión de PostgreSQL que usan las políticas RLS.
 *
 * Uso:
 *   const result = await withRLS(userId, (tx) => tx.select().from(userBooks));
 */
export async function withRLS<T>(
	userId: string,
	callback: (tx: typeof db) => Promise<T>
): Promise<T> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
		return callback(tx as unknown as typeof db);
	});
}
