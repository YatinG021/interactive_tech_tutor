"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { FORCE_LOGOUT_EVENT, TOKEN_KEY, USER_KEY, api, wakeApi } from "./api";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  /** False until localStorage has been read on the client. */
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function persist(token: string, user: User): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Private mode: the session lasts for this tab only.
  }
}

function clearStored(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void wakeApi();
    // localStorage only exists in the browser, so the session is read after hydration.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const raw = localStorage.getItem(USER_KEY);
      if (token && raw) {
        setUser(JSON.parse(raw) as User);
      }
    } catch {
      clearStored();
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */

    const onForceLogout = () => {
      clearStored();
      setUser(null);
    };
    window.addEventListener(FORCE_LOGOUT_EVENT, onForceLogout);
    return () => window.removeEventListener(FORCE_LOGOUT_EVENT, onForceLogout);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.login({ email, password });
    persist(response.token, response.user);
    setUser(response.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const response = await api.register({ name: name.trim() || undefined, email, password });
    persist(response.token, response.user);
    setUser(response.user);
  }, []);

  const logout = useCallback(() => {
    clearStored();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, login, register, logout }), [user, ready, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>.");
  }
  return context;
}

/** Sends signed-out visitors to /login and returns the user once known. */
export function useRequireAuth(): User | null {
  const { user, ready } = useAuth();
  const router = useRouter();
  // usePathname() excludes the basePath, so the redirect target works on GitHub Pages too.
  const pathname = usePathname();
  useEffect(() => {
    if (ready && !user) {
      const next = `${pathname}${window.location.search}`;
      router.replace(`/login/?next=${encodeURIComponent(next)}`);
    }
  }, [ready, user, router, pathname]);
  return ready ? user : null;
}
