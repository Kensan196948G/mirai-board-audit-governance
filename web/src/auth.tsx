import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, fetchMe, login as apiLogin, setToken } from "./api";
import type { User } from "./types";

type AuthState = {
  user: User | null;
  permissions: string[];
  loading: boolean;
  login: (userId: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState>({ user: null, permissions: [], loading: true, login: async () => undefined, logout: () => undefined });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (!localStorage.getItem("mirai_board_demo_token")) {
          setLoading(false);
          return;
        }
        const me = await fetchMe();
        setUser(me.user);
        setPermissions(me.permissions);
      } catch {
        setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (userId: string) => {
    const res = await apiLogin(userId);
    setUser(res.user);
    setPermissions(res.permissions);
  };

  const logout = () => {
    void api("/auth/logout", { method: "POST", token: null }).catch(() => undefined);
    setToken(null);
    setUser(null);
    setPermissions([]);
    window.location.hash = "#/login";
  };

  return <AuthContext.Provider value={{ user, permissions, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function can(permissions: string[], permission: string): boolean {
  return permissions.includes(permission);
}
