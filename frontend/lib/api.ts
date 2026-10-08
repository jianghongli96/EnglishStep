const env = import.meta.env as Record<string, string | undefined>;
const configuredApiBase =
  env.VITE_API_BASE_URL ||
  env.NEXT_PUBLIC_API_BASE_URL ||
  "same-origin";
const API_BASE = configuredApiBase === "same-origin" ? "" : configuredApiBase;

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE && configuredApiBase !== "same-origin") {
    throw new Error("API base URL is not configured.");
  }

  const token =
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem("englishLearning.authToken") || "";
  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `API request failed: ${response.status}`);
  }

  return response.json();
}
