import { createContext, useContext, useState, type ReactNode } from "react";
import { getStoredOfficer, getToken, type Officer } from "./api";

interface AuthState {
  officer: Officer | null;
  loading: boolean;
  setOfficer: (officer: Officer | null) => void;
}

const AuthContext = createContext<AuthState>({ officer: null, loading: false, setOfficer: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [officer, setOfficer] = useState<Officer | null>(() => (getToken() ? getStoredOfficer() : null));

  return <AuthContext.Provider value={{ officer, loading: false, setOfficer }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
