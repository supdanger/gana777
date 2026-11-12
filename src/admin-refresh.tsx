import { createContext, useContext, useMemo, type ReactNode } from 'react';

type AdminRefreshValue = { version: number; scopes?: Record<string, number>; refresh: () => void };

const AdminRefreshContext = createContext<AdminRefreshValue | null>(null);

export function AdminRefreshProvider({ version, scopes, refresh, children }: { version: number; scopes?: Record<string, number>; refresh: () => void; children: ReactNode }) {
  const value = useMemo(() => ({ version, scopes, refresh }), [version, scopes, refresh]);
  return <AdminRefreshContext.Provider value={value}>{children}</AdminRefreshContext.Provider>;
}

export function useAdminRefreshVersion(scope?: string) {
  const value = useContext(AdminRefreshContext);
  return (value?.version ?? 0) + (scope ? value?.scopes?.[scope] ?? 0 : 0);
}

export function useRefreshAdmin() {
  return useContext(AdminRefreshContext)?.refresh ?? (() => {});
}
