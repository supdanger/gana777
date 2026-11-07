import { createContext, useContext, useMemo, type ReactNode } from 'react';

type AdminRefreshValue = { version: number; refresh: () => void };

const AdminRefreshContext = createContext<AdminRefreshValue | null>(null);

export function AdminRefreshProvider({ version, refresh, children }: { version: number; refresh: () => void; children: ReactNode }) {
  const value = useMemo(() => ({ version, refresh }), [version, refresh]);
  return <AdminRefreshContext.Provider value={value}>{children}</AdminRefreshContext.Provider>;
}

export function useAdminRefreshVersion() {
  return useContext(AdminRefreshContext)?.version ?? 0;
}

export function useRefreshAdmin() {
  return useContext(AdminRefreshContext)?.refresh ?? (() => {});
}
