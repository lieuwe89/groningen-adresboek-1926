"use client";

import { usePathname } from "next/navigation";

/**
 * Hook to detect the proxy prefix (e.g. /groningen-1926) from window.location.
 * This is necessary because Next.js router only knows about the path 
 * after the proxy has stripped the prefix.
 */
export function useProxyUrl() {
  const pathname = usePathname() || "";
  
  const getPrefix = () => {
    if (typeof window === "undefined") return "";
    // If window.location.pathname is /groningen-1926/en/info
    // and pathname is /en/info
    // Then prefix is /groningen-1926
    const fullPath = window.location.pathname;
    if (fullPath.endsWith(pathname) && fullPath !== pathname) {
      return fullPath.slice(0, fullPath.lastIndexOf(pathname));
    }
    return "";
  };

  const prefix = getPrefix();

  /**
   * Prepends the detected proxy prefix to a given path.
   * Ensures no double slashes.
   */
  const proxyPath = (path: string) => {
    if (!prefix) return path;
    if (path.startsWith(prefix)) return path;
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${prefix}${cleanPath}`;
  };

  return {
    prefix,
    proxyPath,
  };
}
