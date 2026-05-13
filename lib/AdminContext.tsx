"use client";

import { createContext, useContext, type ReactNode } from "react";

const AdminContext = createContext(false);

export function AdminScope({ children }: { children: ReactNode }) {
  return <AdminContext.Provider value={true}>{children}</AdminContext.Provider>;
}

export function useIsAdminRoute(): boolean {
  return useContext(AdminContext);
}
