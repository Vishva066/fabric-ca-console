// API service layer for Fabric CA backend

import type {
  RegisterRequest,
  EnrollRequest,
  ReenrollRequest,
  RevokeRequest,
  RevokeResponse,
  CertificateInfo,
  DecodeResult,
} from "./types";

async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(endpoint, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
    const errorMsg =
      data?.error ||
      data?.errors?.[0]?.message ||
      `Request failed with status ${res.status}`;
    throw new Error(errorMsg);
  }

  return data as T;
}

// ---------- Identities ----------

export async function listIdentities() {
  return apiFetch<{
    result: { identities: Array<Record<string, unknown>> };
    errors: Array<{ code: number; message: string }>;
    messages: Array<{ code: number; message: string }>;
    success: boolean;
  }>("/api/v1/identities");
}

// ---------- Certificates ----------

export async function getCertificates(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return apiFetch<{
    result: { certs: CertificateInfo[] };
  }>(`/api/v1/certificates${qs}`);
}

// ---------- Register ----------

export async function registerIdentity(body: RegisterRequest) {
  return apiFetch<{ success: boolean; message: string }>(
    "/api/v1/register",
    { method: "POST", body: JSON.stringify(body) }
  );
}

// ---------- Enroll ----------

export async function enrollIdentity(body: EnrollRequest) {
  return apiFetch<{ result: Record<string, unknown> }>(
    "/api/v1/enroll",
    { method: "POST", body: JSON.stringify(body) }
  );
}

// ---------- Re-enroll ----------

export async function reenrollIdentity(body: ReenrollRequest) {
  return apiFetch<{ result: Record<string, unknown> }>(
    "/api/v1/reenroll",
    { method: "POST", body: JSON.stringify(body) }
  );
}

// ---------- Revoke ----------

export async function revokeIdentity(body: RevokeRequest) {
  return apiFetch<RevokeResponse>(
    "/api/v1/revoke",
    { method: "POST", body: JSON.stringify(body) }
  );
}

// ---------- CRL ----------

export async function getCRLList() {
  return apiFetch<{ result: { crl_ids: string[] } }>("/api/v1/crls");
}

// ---------- CA Info ----------

export async function getCAInfo() {
  return apiFetch<{ result: Record<string, unknown> }>("/api/v1/cainfo");
}

// ---------- Certificate / CSR Decoder ----------

export async function decodeCertificate(pem: string) {
  return apiFetch<{ result: DecodeResult }>("/api/v1/decode", {
    method: "POST",
    body: JSON.stringify({ pem }),
  });
}
