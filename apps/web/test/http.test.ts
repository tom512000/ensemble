import { describe, expect, it } from 'vitest';
import { httpMessage, networkMessage, parseGuest, readJson } from '../src/lib/http.js';

describe('resilient HTTP replies', () => {
  it('reads a JSON body', async () => {
    expect(
      await readJson(new Response('{"message":"Trop de demandes."}', { status: 429 })),
    ).toEqual({ message: 'Trop de demandes.' });
  });
  it('returns null instead of throwing on an empty, truncated or HTML body', async () => {
    // A restarting backend behind a dev proxy, or a gateway error, answers exactly like this.
    for (const body of ['', '{"id":', '<html><body>502 Bad Gateway</body></html>', 'null']) {
      await expect(readJson(new Response(body, { status: 502 }))).resolves.toBeNull();
    }
  });
  it('prefers the server message and falls back per status', () => {
    expect(httpMessage(400, { message: 'Deux caractères minimum.' })).toBe(
      'Deux caractères minimum.',
    );
    expect(httpMessage(429, null)).toMatch(/minute/);
    expect(httpMessage(502, null)).toMatch(/remet en route/);
    expect(httpMessage(500, { message: '' })).toMatch(/remet en route/);
    expect(httpMessage(400, '<html>')).toMatch(/momentanément indisponible/);
  });
  it('explains a timeout and an unreachable server without leaking internals', () => {
    const timeout = new Error('The operation was aborted.');
    timeout.name = 'TimeoutError';
    expect(networkMessage(timeout)).toMatch(/trop de temps/);
    expect(networkMessage(new TypeError('Failed to fetch'))).toMatch(/Vérifiez votre connexion/);
    expect(networkMessage(networkMessage)).not.toMatch(/fetch/);
  });
  it('accepts only a complete guest session', () => {
    expect(parseGuest({ id: 'a', nickname: 'Camille', token: 'b' })).toEqual({
      id: 'a',
      nickname: 'Camille',
      token: 'b',
    });
    for (const value of [
      null,
      undefined,
      '',
      42,
      [],
      {},
      { id: 'a', nickname: 'Camille' },
      { id: 'a', nickname: 'Camille', token: '' },
      { id: 'a', nickname: 'Camille', token: 7 },
    ]) {
      expect(parseGuest(value)).toBeNull();
    }
  });
});
