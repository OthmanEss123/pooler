export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

export type ApiQuery = Record<
  string,
  string | number | boolean | null | undefined
>;

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

type ApiFetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  query?: ApiQuery;
};

function buildUrl(path: string, query?: ApiQuery) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${API_URL}${normalizedPath}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function parseResponse(response: Response) {
  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

let refreshPromise: Promise<{ ok: boolean }> | null = null;

async function getRefreshPromise() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) {
          return { ok: false };
        }
        const data = await res.json().catch(() => ({}));
        return data && typeof data === "object" && "ok" in data && data.ok === true
          ? { ok: true }
          : { ok: false };
      })
      .catch(() => ({ ok: false }))
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const hasBody = options.body !== undefined;

  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(buildUrl(path, options.query), {
    ...options,
    body: hasBody ? JSON.stringify(options.body) : undefined,
    credentials: "include",
    headers,
  });

  if (
    response.status === 401 &&
    !path.includes("/auth/refresh") &&
    !path.includes("/auth/login")
  ) {
    const refreshed = await getRefreshPromise();
    if (refreshed.ok) {
      const retryResponse = await fetch(buildUrl(path, options.query), {
        ...options,
        body: hasBody ? JSON.stringify(options.body) : undefined,
        credentials: "include",
        headers,
      });

      const retryData = await parseResponse(retryResponse);

      if (retryResponse.ok) {
        return retryData as T;
      }

      const message =
        typeof retryData === "object" &&
        retryData !== null &&
        "message" in retryData &&
        typeof retryData.message === "string"
          ? retryData.message
          : `API request failed with status ${retryResponse.status}`;

      throw new ApiError(message, retryResponse.status, retryData);
    }
  }

  const data = await parseResponse(response);

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : `API request failed with status ${response.status}`;

    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

export function isApiUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

