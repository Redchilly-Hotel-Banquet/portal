import { clearAdminSession, getAdminToken } from "./authSession";
import { clearUserSession, getUserToken } from "./userSession";

const API_BASE_URL = "/api";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type RequestOptions<TBody> = {
  method?: "GET" | "POST";
  body?: TBody;
  /** true = staff token, "user" = signed-in guest/staff account token. */
  auth?: boolean | "user";
  signal?: AbortSignal;
};

const parseResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export const apiRequest = async <TResponse, TBody = unknown>(
  path: string,
  { method = "POST", body, auth = false, signal }: RequestOptions<TBody> = {},
): Promise<TResponse> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = auth === "user" ? getUserToken() : getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  const parsed = await parseResponse(response);
  if (!response.ok) {
    if (response.status === 401 && auth) {
      if (auth === "user") clearUserSession();
      else clearAdminSession();
    }
    const message =
      parsed && typeof parsed === "object" && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : response.statusText || "Request failed";
    throw new ApiError(response.status, message, parsed);
  }
  return parsed as TResponse;
};

export const apiGet = <TResponse>(path: string, auth: boolean | "user" = false) =>
  apiRequest<TResponse>(path, { method: "GET", auth });

export const apiPost = <TResponse, TBody = unknown>(path: string, body?: TBody, auth: boolean | "user" = false) =>
  apiRequest<TResponse, TBody>(path, { method: "POST", body, auth });
