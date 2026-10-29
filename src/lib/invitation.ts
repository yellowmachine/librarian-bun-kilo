/** Cuánto dura el enlace de una invitación. */
export const INVITATION_DAYS = 7;

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

/** En qué está una invitación, según lo que se guardó de ella. */
export function invitationStatus(
	i: { usedAt: Date | null; cancelledAt: Date | null; expiresAt: Date },
	now = new Date()
): InvitationStatus {
	if (i.usedAt) return 'accepted';
	if (i.cancelledAt) return 'cancelled';
	return i.expiresAt <= now ? 'expired' : 'pending';
}

export const invitationExpiry = (from = new Date()) =>
	new Date(from.getTime() + INVITATION_DAYS * 24 * 60 * 60 * 1000);

/** Un email con pinta de serlo: lo que se pide antes de invitar. */
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
