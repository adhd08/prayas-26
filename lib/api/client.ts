/**
 * The one place an endpoint URL is constructed.
 *
 * Components never fetch directly. They call a service in lib/api, and the
 * service decides between the bundled mock and this client based on
 * USE_MOCK_DATA. When the backend arrives, only the service bodies change.
 */

import { API_BASE_URL, USE_MOCK_DATA } from "@/lib/config";
import type { ProvenanceKind } from "@/types";

export class ApiUnavailableError extends Error {
  constructor(path: string, cause?: unknown) {
    super(`Sylvida backend did not answer ${path}`);
    this.name = "ApiUnavailableError";
    this.cause = cause;
  }
}

export const provenance: ProvenanceKind = USE_MOCK_DATA ? "demo" : "backend";

export async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (!API_BASE_URL) throw new ApiUnavailableError(path);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
    if (!res.ok) throw new ApiUnavailableError(path, res.status);
    return (await res.json()) as T;
  } catch (error) {
    throw new ApiUnavailableError(path, error);
  }
}

/**
 * Keeps mock calls asynchronous so swapping in a real network call never
 * changes a caller's control flow.
 */
export function resolve<T>(value: T, delayMs = 0): Promise<T> {
  if (delayMs <= 0) return Promise.resolve(value);
  return new Promise((done) => setTimeout(() => done(value), delayMs));
}
