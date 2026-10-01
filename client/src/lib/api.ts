export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = 'ERROR',
    public details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

const readCookie = (name: string) =>
  document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.split('=')[1];

async function ensureCsrf() {
  if (!readCookie('hl_csrf')) await fetch('/api/auth/csrf', { credentials: 'include' });
}

let refreshing: Promise<boolean> | null = null;

/** Un seul rafraîchissement à la fois, même si plusieurs requêtes échouent en même temps. */
function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      await ensureCsrf();
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': readCookie('hl_csrf') ?? '' },
        body: '{}',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

interface Options {
  body?: unknown;
  signal?: AbortSignal;
  /** Désactive la tentative de rafraîchissement automatique (login, refresh...). */
  noRefresh?: boolean;
}

async function request<T>(method: string, path: string, opts: Options = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  if (method !== 'GET') {
    await ensureCsrf();
    headers['X-CSRF-Token'] = readCookie('hl_csrf') ?? '';
  }
  const res = await fetch(`/api${path}`, { method, headers, body, credentials: 'include', signal: opts.signal });

  if (res.status === 401 && !retried && !opts.noRefresh && !path.startsWith('/auth/')) {
    if (await refreshSession()) return request<T>(method, path, opts, true);
    window.dispatchEvent(new Event('hl:session-expired'));
  }
  if (!res.ok) {
    let payload: { error?: { code?: string; message?: string; details?: ApiError['details'] } } = {};
    try {
      payload = await res.json();
    } catch {
      /* corps vide */
    }
    throw new ApiError(res.status, payload.error?.message ?? res.statusText, payload.error?.code, payload.error?.details);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') ?? '';
  return (type.includes('json') ? res.json() : res.blob()) as Promise<T>;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, { signal }),
  post: <T>(path: string, body?: unknown, o: Omit<Options, 'body'> = {}) => request<T>('POST', path, { ...o, body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body: body ?? {} }),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/** Ouvre un fichier protégé (cookie de session) dans un nouvel onglet ou le télécharge. */
export async function downloadFile(path: string, filename?: string) {
  const res = await fetch(`/api${path}`, { credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, 'Téléchargement impossible');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? '';
  if (!filename) a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
