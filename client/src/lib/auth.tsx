import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import type { User } from './types';

interface MeResponse {
  user: User;
  pending2fa: boolean;
}

interface AuthState {
  user: User | null;
  pending2fa: boolean;
  loading: boolean;
  setSession: (user: User, pending2fa: boolean) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<MeResponse>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null; // non connecté : état normal
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const setSession = useCallback((user: User, pending2fa: boolean) => qc.setQueryData(['me'], { user, pending2fa }), [qc]);
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['me'] }), [qc]);
  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
    }
  }, [qc]);

  // Une requête qui n'a pas pu rafraîchir la session renvoie l'utilisateur vers la connexion.
  useEffect(() => {
    const onExpired = () => {
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
    };
    window.addEventListener('hl:session-expired', onExpired);
    return () => window.removeEventListener('hl:session-expired', onExpired);
  }, [qc]);

  const value = useMemo<AuthState>(
    () => ({ user: q.data?.user ?? null, pending2fa: q.data?.pending2fa ?? false, loading: q.isLoading, setSession, logout, refresh }),
    [q.data, q.isLoading, setSession, logout, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider manquant');
  return c;
}

/** Utilisateur connecté garanti (à utiliser sous une route protégée). */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('Utilisateur requis');
  return user;
}
