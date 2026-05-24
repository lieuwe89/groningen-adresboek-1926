"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useParams } from "next/navigation";
import { ADMIN_LOGIN_API_PATH } from "@/lib/adminRouteContract";

export default function LoginPage() {
  const search = useSearchParams();
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? "nl";
  const next = search?.get("next") || `/${locale}/admin`;

  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await fetch(ADMIN_LOGIN_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, pw }),
      credentials: "include",
    });
    if (res.ok) {
      // Full-page navigation ensures the admin route loads through the PHP
      // proxy — router.replace() would hand the proxy-prefixed path to
      // Next.js's client router, which doesn't understand the prefix.
      window.location.href = next;
    } else {
      setPending(false);
      setError(res.status === 401 ? "Invalid credentials" : "Login failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 bg-white p-6 rounded shadow"
        autoComplete="on"
      >
        <h1 className="text-xl font-semibold">Admin login</h1>
        <label className="block">
          <span className="text-sm">Gebruiker</span>
          <input
            type="text"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoComplete="username"
            required
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm">Wachtwoord</span>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="current-password"
            required
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-stone-800 text-white py-2 rounded disabled:opacity-60"
        >
          {pending ? "..." : "Login"}
        </button>
      </form>
    </div>
  );
}
