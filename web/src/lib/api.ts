import * as contracts from "./contracts";
import type { z } from "zod";
import type { Bootstrap, Bundle, ExpensePage, Fx, Revision } from "./types";
export const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
import { ApiError } from "./errors";
export { ApiError } from "./errors";
export const DEVICE_MODE =
  import.meta.env.VITE_STORAGE_MODE !== "server" && !API_BASE;
export async function request<T>(
  path: string,
  init: RequestInit = {},
  revision?: Revision,
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
  let data: {
    detail?: string;
    code?: string;
    fieldErrors?: Record<string, string>;
  };
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      "伺服器暫時無法處理，輸入內容已保留。請稍後重試。",
      response.status,
      "invalid_response",
    );
  }
  if (!response.ok)
    throw new ApiError(
      typeof data?.detail === "string"
        ? data.detail
        : "資料未能儲存，請確認內容後再試。",
      response.status,
      data?.code,
      data?.fieldErrors,
    );
  return data as T;
}
function validate<T>(schema: z.ZodType<T>, input: T): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApiError(
      "請修正標示的欄位後再儲存。",
      422,
      "validation",
      Object.fromEntries(
        result.error.issues.map((i) => [
          i.path.join("."),
          "請確認內容、日期或金額格式。",
        ]),
      ),
    );
  return result.data;
}
export const api = {
  createTrip: (input: contracts.TripCreateInput) =>
    api.write<{ trip_id: string }>(
      "/trips",
      validate(contracts.tripCreate, input),
    ),
  updateTrip: (
    tid: string,
    input: contracts.TripEditInput,
    revision: Revision,
  ) =>
    api.write(
      `/trips/${tid}`,
      validate(contracts.tripEdit, input),
      "PUT",
      revision,
    ),
  saveExpense: (
    tid: string,
    input: contracts.ExpenseInput,
    revision: Revision,
  ) =>
    api.write(
      `/trips/${tid}/expenses`,
      validate(contracts.expense, input),
      "POST",
      revision,
    ),
  saveActivity: (
    tid: string,
    input: contracts.ActivityInput,
    revision: Revision,
    id?: number,
  ) =>
    api.write(
      `/trips/${tid}/activities${id === undefined ? "" : `/${id}`}`,
      validate(contracts.activity, input),
      id === undefined ? "POST" : "PUT",
      revision,
    ),
  saveBooking: (
    tid: string,
    input: contracts.BookingInput,
    revision: Revision,
    id?: number,
  ) =>
    api.write(
      `/trips/${tid}/bookings${id === undefined ? "" : `/${id}`}`,
      validate(contracts.booking, input),
      id === undefined ? "POST" : "PUT",
      revision,
    ),
  saveShopping: (
    tid: string,
    input: contracts.ShoppingInput,
    revision: Revision,
    id?: number,
  ) =>
    api.write(
      `/trips/${tid}/shopping${id === undefined ? "" : `/${id}`}`,
      validate(contracts.shopping, input),
      id === undefined ? "POST" : "PUT",
      revision,
    ),
  changeCurrency: (
    tid: string,
    home: contracts.HomeCurrency,
    revision: Revision,
  ) => api.write(`/trips/${tid}/currency`, { home }, "POST", revision),
  addMember: (tid: string, name: string) =>
    api.write(`/trips/${tid}/members`, validate(contracts.member, { name })),
  markBought: (tid: string, id: number, bought: boolean, revision: Revision) =>
    api.write(`/trips/${tid}/shopping/${id}`, { bought }, "PATCH", revision),
  deleteItem: (
    tid: string,
    kind: "expenses" | "activities" | "bookings" | "shopping",
    id: number,
    revision: Revision,
  ) => api.remove(`/trips/${tid}/${kind}/${id}`, revision),
  loadDemo: () => api.write<{ trip_id: string }>("/demo", {}),
  bootstrap: () => request<Bootstrap>("/bootstrap"),
  trip: (tid: string) => request<Bundle>(`/trips/${tid}?summary=1`),
  expenses: (tid: string, query: string, category: string, page: number) =>
    request<ExpensePage>(
      `/trips/${tid}/expenses?${new URLSearchParams({ q: query, category, page: String(page) })}`,
    ),
  refresh: () => request<Fx>("/fx/refresh", { method: "POST" }),
  write: <T = unknown>(
    path: string,
    body: unknown,
    method = "POST",
    revision?: Revision,
  ) => request<T>(path, { method, body: JSON.stringify(body) }, revision),
  remove: (path: string, revision: Revision) =>
    request(path, { method: "DELETE" }, revision),
  backup: (tid?: string) =>
    request<Record<string, unknown>>(
      tid ? `/backup/${encodeURIComponent(tid)}` : "/backup",
    ),
};
