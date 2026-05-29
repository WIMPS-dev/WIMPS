import Cookies from 'js-cookie';

const TOKEN_KEY = 'token';

export const getAuthToken = (): string | null =>
  Cookies.get(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);

export const saveAuthToken = (token: string) => {
  Cookies.set(TOKEN_KEY, token, { expires: 1, sameSite: 'lax' });
  localStorage.setItem(TOKEN_KEY, token);
};

export const clearAuthToken = () => {
  Cookies.remove(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
};

export const getApiHeaders = (token?: string | null, json = false): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  headers['ngrok-skip-browser-warning'] = 'true';
  return headers;
};
