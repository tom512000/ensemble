import type { GuestSession } from '@ensemble/shared';

export const apiBase = import.meta.env.VITE_API_URL ?? '';

// A guest session only counts when every field is present: a proxy may answer with anything.
export function parseGuest(value: unknown): GuestSession | null {
  if (
    !value ||
    typeof value !== 'object' ||
    !('id' in value) ||
    !('token' in value) ||
    !('nickname' in value)
  )
    return null;
  const { id, nickname, token } = value as Record<'id' | 'nickname' | 'token', unknown>;
  if (
    typeof id !== 'string' ||
    typeof nickname !== 'string' ||
    typeof token !== 'string' ||
    !id ||
    !nickname ||
    !token
  )
    return null;
  return { id, nickname, token };
}

// An empty body, HTML from a proxy or a gateway error must never surface as a parser exception.
export async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export function httpMessage(status: number, body: unknown): string {
  if (
    body &&
    typeof body === 'object' &&
    'message' in body &&
    typeof body.message === 'string' &&
    body.message
  )
    return body.message;
  if (status === 429) return 'Un peu trop de demandes. Réessayez dans une minute.';
  if (status >= 500) return 'Le serveur se remet en route. Réessayez dans un instant.';
  return 'Le serveur est momentanément indisponible.';
}

export function networkMessage(error: unknown): string {
  return error instanceof Error && error.name === 'TimeoutError'
    ? 'Le serveur met trop de temps à répondre. Réessayez.'
    : 'Impossible de joindre le serveur. Vérifiez votre connexion.';
}
