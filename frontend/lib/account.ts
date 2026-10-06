import { api } from "@/lib/api";
import type { AccountPayload, AccountRole } from "@/lib/types";

const ACCOUNT_USER_ID_KEY = "englishLearning.accountUserId";
const ACCOUNT_TOKEN_KEY = "englishLearning.authToken";

export function getSavedAccountUserId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ACCOUNT_USER_ID_KEY) || "";
}

export function saveAccountUserId(userId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCOUNT_USER_ID_KEY, userId);
}

export function getSavedAuthToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ACCOUNT_TOKEN_KEY) || "";
}

export function saveAuthToken(token: string) {
  if (typeof window === "undefined" || !token) return;
  window.localStorage.setItem(ACCOUNT_TOKEN_KEY, token);
}

export function clearAccountUserId() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCOUNT_USER_ID_KEY);
  window.localStorage.removeItem(ACCOUNT_TOKEN_KEY);
}

export async function loadCurrentAccount() {
  const token = getSavedAuthToken();
  if (!token) return null;
  const payload = await api<AccountPayload>("/api/accounts/me");
  if (payload.token) saveAuthToken(payload.token);
  saveAccountUserId(payload.user.id);
  return payload;
}

export async function loginAccount(username: string, password: string) {
  const payload = await api<AccountPayload>("/api/accounts/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  saveAccountUserId(payload.user.id);
  if (payload.token) saveAuthToken(payload.token);
  return payload;
}

export async function registerAccount({
  username,
  password,
  name,
  role,
  grade,
  level,
}: {
  username: string;
  password: string;
  name: string;
  role: AccountRole;
  grade?: string;
  level?: string;
}) {
  const payload = await api<AccountPayload>("/api/accounts/register", {
    method: "POST",
    body: JSON.stringify({ username, password, name, role, grade, level }),
  });
  saveAccountUserId(payload.user.id);
  if (payload.token) saveAuthToken(payload.token);
  return payload;
}
