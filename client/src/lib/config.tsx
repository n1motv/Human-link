import { createContext, useContext, type ReactNode } from 'react';
import type { PublicConfig } from './types';

const ConfigContext = createContext<PublicConfig | null>(null);

export function ConfigProvider({ value, children }: { value: PublicConfig; children: ReactNode }) {
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): PublicConfig {
  const c = useContext(ConfigContext);
  if (!c) throw new Error('ConfigProvider manquant');
  return c;
}
