"use client";

import { getApiUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";
import type { components } from "@/lib/api/schema";

export type JobStatus = components["schemas"]["JobStatus"];
export type JobRequest = components["schemas"]["JobRequest"];
export type JobAccepted = components["schemas"]["JobAccepted"];

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (authenticated) {
    // Reading the browser session only forwards the token; FastAPI verifies it.
    const { data: { session }, error } = await createClient().auth.getSession();
    if (error || !session) throw new ApiError(401, "Sign in first.");
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  const timeout = AbortSignal.timeout(15_000);
  const response = await fetch(`${getApiUrl()}${path}`, {
    ...init, headers, cache: "no-store",
    signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status,
      typeof body?.detail === "string" ? body.detail : `API request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export function checkApiHealth(signal?: AbortSignal) {
  return request<{ status: string; service: string }>("/health", { signal }, false);
}

// These contracts currently return HTTP 501 after authentication.
export function submitJob(payload: JobRequest, signal?: AbortSignal) {
  return request<JobAccepted>("/v1/jobs", { method: "POST", body: JSON.stringify(payload), signal });
}

export function getJob(jobId: string, signal?: AbortSignal) {
  return request<JobStatus>(`/v1/jobs/${encodeURIComponent(jobId)}`, { signal });
}

export async function pollJob(jobId: string, options: {
  signal: AbortSignal;
  onUpdate?: (job: JobStatus) => void;
  intervalMs?: number;
  timeoutMs?: number;
}) {
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 300_000)]);
  while (true) {
    signal.throwIfAborted();
    const job = await getJob(jobId, signal);
    options.onUpdate?.(job);
    if (job.status === "succeeded" || job.status === "failed") return job;
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, Math.max(500, options.intervalMs ?? 2000));
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  }
}
