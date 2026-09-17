import type { Bootstrap, Bundle, Fx } from "./types";
export const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
import { ApiError } from "./errors";
export { ApiError } from "./errors";
export const DEVICE_MODE =
  import.meta.env.VITE_STORAGE_MODE !== "server" && !API_BASE;
export async function request<T>(
  path: string,
  init: RequestInit = {},
  revision?: number,
): Promise<T> {
  if (DEVICE_MODE) {
    const { localRequest } = await import("./device/store");
    return localRequest<T>(path, init, revision);
  }
  const token = sessionStorage.getItem("record-life-token");
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(revision !== undefined ? { "If-Match": String(revision) } : {}),
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(25000),
    });
  } catch {
    throw new ApiError(
      "目前無法連線，輸入內容已保留。請檢查連線後再試一次。",
      0,
    );
  }
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      typeof data.detail === "string"
        ? data.detail
        : "資料未能儲存，請確認內容後再試。",
      response.status,
    );
  return data as T;
}
export const api = {
  bootstrap: () => request<Bootstrap>("/bootstrap"),
  trip: (tid: string) => request<Bundle>(`/trips/${tid}`),
  refresh: () => request<Fx>("/fx/refresh", { method: "POST" }),
  write: <T = unknown>(
    path: string,
    body: unknown,
    method = "POST",
    revision?: number,
  ) => request<T>(path, { method, body: JSON.stringify(body) }, revision),
  remove: (path: string, revision: number) =>
    request(path, { method: "DELETE" }, revision),
  backup: () => request<Record<string, unknown>>("/backup"),
};
