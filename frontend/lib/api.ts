import { toast } from "@/components/ui/toast";

const env = import.meta.env as Record<string, string | undefined>;
const configuredApiBase =
  env.VITE_API_BASE_URL ||
  env.NEXT_PUBLIC_API_BASE_URL ||
  "same-origin";
const API_BASE = configuredApiBase === "same-origin" ? "" : configuredApiBase;

let lastErrorToast = "";
let lastErrorToastAt = 0;

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE && configuredApiBase !== "same-origin") {
    const error = new Error("API base URL is not configured.");
    notifyApiError(error.message, path);
    throw error;
  }

  const token =
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem("englishLearning.authToken") || "";
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch (caught) {
    const message =
      caught instanceof Error
        ? caught.message
        : "接口连接失败，请检查后端服务或网络。";
    notifyApiError(message, path);
    throw caught;
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.error || `API request failed: ${response.status}`;
    notifyApiError(message, path, response.status);
    throw new Error(message);
  }

  return response.json();
}

function notifyApiError(message: string, path: string, status?: number) {
  if (typeof window === "undefined") return;

  const now = Date.now();
  const toastKey = `${status || "network"}:${path}:${message}`;
  if (toastKey === lastErrorToast && now - lastErrorToastAt < 1800) return;
  lastErrorToast = toastKey;
  lastErrorToastAt = now;

  toast.add({
    title: status ? `接口请求失败 (${status})` : "接口请求失败",
    description: `${friendlyApiMessage(message)}\n${path}`,
    type: "error",
    priority: "high",
    timeout: 6000,
  });
}

function friendlyApiMessage(message: string) {
  if (message === "Failed to fetch" || message.includes("NetworkError")) {
    return "连接后端失败，请检查服务是否启动或网络是否正常。";
  }
  return message;
}
