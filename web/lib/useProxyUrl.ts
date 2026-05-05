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
    
    // We remove the trailing slash from the pathname for comparison
    const cleanPathname = pathname === "/" ? "" : pathname;
    const fullPath = window.location.pathname;
    
    if (cleanPathname === "") {
        // If we are at the root (relative to the app), check for the mount point
        if (fullPath.includes("/groningen-1926")) {
            return "/groningen-1926";
        }
        return "";
    }

    if (fullPath.endsWith(cleanPathname) && fullPath !== cleanPathname) {
      return fullPath.slice(0, fullPath.lastIndexOf(cleanPathname));
    }
    
    // Fallback: check if /groningen-1926 is in the path at all
    if (fullPath.includes("/groningen-1926")) {
        return "/groningen-1926";
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
