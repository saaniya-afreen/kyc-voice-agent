const API_BASE = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY = "kyc_officer_token";
const OFFICER_KEY = "kyc_officer";

export interface Officer {
  id: string;
  email: string;
  name: string | null;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredOfficer(): Officer | null {
  const raw = localStorage.getItem(OFFICER_KEY);
  return raw ? (JSON.parse(raw) as Officer) : null;
}

function setSession(token: string, officer: Officer) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(OFFICER_KEY, JSON.stringify(officer));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(OFFICER_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  }).catch(() => {
    throw new ApiError("Network error — could not reach the API.", 0);
  });

  if (res.status === 401) {
    clearSession();
    window.location.href = "/login";
    throw new ApiError("Session expired. Please log in again.", 401);
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      // ignore — keep statusText
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return null as T;
  return res.json();
}

export async function login(email: string, password: string): Promise<Officer> {
  const data = await request<{ access_token: string; officer: Officer }>("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setSession(data.access_token, data.officer);
  return data.officer;
}

export function logout() {
  clearSession();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
};
