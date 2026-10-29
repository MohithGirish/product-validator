// Shared fetch for the backend API. Keeps the session token in localStorage
// (so sign-in survives a reload), sends it as `Authorization: Bearer <token>`
// on every request, and when the server answers 401 (outside /api/auth/) clears
// the token and fires the 'auth:expired' event, which AuthContext turns into a
// sign-out.

const TOKEN_KEY = 'auth_token';
export const AUTH_EXPIRED_EVENT = 'auth:expired';

export const getToken = (): string | null => {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string | null): void => {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked (private mode): sign-in still works until the page reloads.
  }
};

/** Carries an error the server answered with; `status` tells it apart from a network failure. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Calls the API with the session token. Throws ApiError for an error response
 * and lets network failures (TypeError / AbortError) through unchanged.
 * A 401 outside /api/auth/ means the session ended: the token is cleared and
 * AUTH_EXPIRED_EVENT fires. (A 401 from login is just a wrong password.)
 */
export const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(url, { ...options, headers });
  if (response.ok) return response;

  if (response.status === 401 && token && !url.startsWith('/api/auth/')) {
    setToken(null);
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
  const body = await response.json().catch(() => ({ error: response.statusText }));
  throw new ApiError(body.error || `Backend error: ${response.status}`, response.status);
};

/** Calls a JSON endpoint: sends `body` as JSON and parses the reply (undefined for 204). */
export const apiJson = async <T>(url: string, method = 'GET', body?: unknown): Promise<T> => {
  const response = await apiFetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return response.status === 204 ? (undefined as T) : response.json();
};
