"use client";
import { createContext, useContext, useEffect, useState } from "react";

// auth-context: persists profile handle in localStorage as physi_nickname / physi_fullname
// Example stored value: physi_nickname = "alex_02" (generic; 2–30 chars, a-zA-Z0-9_.- )
// Note: handles like "Dream"/"dream" are valid per /^[a-zA-Z0-9_.\-]+$/ and 2–30 length,
// but not used as placeholder to protect private nickname. Validation is case-sensitive
// on storage, case-insensitive on server lookup (lower(nickname) = lower($1)).

type Auth = { nickname: string; fullName: string };
const Ctx = createContext<{
  auth: Auth | null;
  setAuth: (a: Auth | null) => void;
} | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuthState] = useState<Auth | null>(null);
  useEffect(() => {
    const n = localStorage.getItem("physi_nickname"); // e.g., "alex_02" — also handles "Dream"/"dream" (2–30, regex ok)
    const f = localStorage.getItem("physi_fullname"); // e.g., "John Doe"
    if (n) setAuthState({ nickname: n, fullName: f || n });
    const h = () => {
      const nn = localStorage.getItem("physi_nickname");
      const ff = localStorage.getItem("physi_fullname");
      if (nn) setAuthState({ nickname: nn, fullName: ff || nn });
    };
    window.addEventListener("physi_auth", h);
    return () => window.removeEventListener("physi_auth", h);
  }, []);
  const setAuth = (a: Auth | null) => {
    if (a) {
      localStorage.setItem("physi_nickname", a.nickname);
      localStorage.setItem("physi_fullname", a.fullName);
    } else {
      localStorage.removeItem("physi_nickname");
      localStorage.removeItem("physi_fullname");
    }
    setAuthState(a);
    window.dispatchEvent(new Event("physi_auth"));
  };
  return <Ctx.Provider value={{ auth, setAuth }}>{children}</Ctx.Provider>;
}
export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}
