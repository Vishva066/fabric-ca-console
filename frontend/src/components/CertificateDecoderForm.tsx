"use client";

import { useState, useRef } from "react";
import { decodeCertificate } from "@/lib/api";
import type { DecodeResult, DecodedName, DecodedSans } from "@/lib/types";

function formatName(name: DecodedName): string {
  const parts: string[] = [];
  if (name.commonName) parts.push(`CN=${name.commonName}`);
  if (name.organization) parts.push(`O=${name.organization}`);
  if (name.organizationalUnit) parts.push(`OU=${name.organizationalUnit}`);
  if (name.locality) parts.push(`L=${name.locality}`);
  if (name.stateOrProvince) parts.push(`ST=${name.stateOrProvince}`);
  if (name.country) parts.push(`C=${name.country}`);
  return parts.length ? parts.join(", ") : "—";
}

function formatSans(sans: DecodedSans): string[] {
  const out: string[] = [];
  sans.dns.forEach((v) => out.push(`DNS:${v}`));
  sans.ip.forEach((v) => out.push(`IP:${v}`));
  sans.email.forEach((v) => out.push(`Email:${v}`));
  sans.uri.forEach((v) => out.push(`URI:${v}`));
  return out.length ? out : ["—"];
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function CertificateDecoderForm() {
  const [pem, setPem] = useState("");
  const [result, setResult] = useState<DecodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result || "");
      setPem(text);
      setResult(null);
      setError(null);
    };
    reader.onerror = () => {
      setError("Failed to read the selected file.");
    };
    reader.readAsText(file);
  };

  const handleDecode = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    setError(null);

    if (!pem.trim()) {
      setError("Please paste or upload a certificate/CSR.");
      return;
    }

    try {
      setLoading(true);
      const res = await decodeCertificate(pem);
      setResult(res.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decode failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setPem("");
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleDecode}
        className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Decode Certificate or CSR
          </h2>
          <p className="text-base text-zinc-500 dark:text-zinc-400">
            Paste a PEM-encoded certificate or certificate signing request, or upload a file.
          </p>
        </div>

        {/* File upload */}
        <div className="mb-5">
          <label className="block text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            Upload Certificate / CSR File
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pem,.crt,.cer,.cert,.csr,.txt"
            onChange={handleFileChange}
            className="block w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:file:bg-indigo-950 dark:file:text-indigo-300"
          />
        </div>

        {/* Text area */}
        <div className="mb-5">
          <label className="block text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            Certificate / CSR Content
          </label>
          <textarea
            value={pem}
            onChange={(e) => setPem(e.target.value)}
            placeholder={`-----BEGIN CERTIFICATE-----\nMIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiUMA0GCSqGSIb3Qa3BajELMAkGA1UEBhMC\n...\n-----END CERTIFICATE-----`}
            rows={10}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base font-mono focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 rounded-lg bg-red-50 p-3 text-base text-red-700 dark:bg-red-950/50 dark:text-red-400">
            ❌ {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-5 py-3 text-base font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Decoding…" : "Decode"}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg border border-zinc-300 bg-white px-5 py-3 text-base font-medium text-zinc-700 hover:bg-zinc-50 transition-colors dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Clear
          </button>
        </div>
      </form>

      {/* Result */}
      {result && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-4 flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                result.type === "certificate"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              }`}
            >
              {result.type === "certificate" ? "Certificate" : "Certificate Signing Request"}
            </span>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Subject
              </h3>
              <p className="mt-1 break-words text-base text-zinc-900 dark:text-zinc-100">
                {formatName(result.subject)}
              </p>
            </div>

            {result.type === "certificate" && (
              <>
                <div className="sm:col-span-2">
                  <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    Issuer
                  </h3>
                  <p className="mt-1 break-words text-base text-zinc-900 dark:text-zinc-100">
                    {formatName(result.issuer)}
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    Serial Number
                  </h3>
                  <p className="mt-1 break-all font-mono text-base text-zinc-900 dark:text-zinc-100">
                    {result.serialNumber}
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    Validity
                  </h3>
                  <p className="mt-1 text-base text-zinc-900 dark:text-zinc-100">
                    {formatDate(result.validFrom)} → {formatDate(result.validTo)}
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    SHA-1 Fingerprint
                  </h3>
                  <p className="mt-1 break-all font-mono text-base text-zinc-900 dark:text-zinc-100">
                    {result.sha1Fingerprint}
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    SHA-256 Fingerprint
                  </h3>
                  <p className="mt-1 break-all font-mono text-base text-zinc-900 dark:text-zinc-100">
                    {result.sha256Fingerprint}
                  </p>
                </div>
              </>
            )}

            <div>
              <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Signature Algorithm
              </h3>
              <p className="mt-1 text-base text-zinc-900 dark:text-zinc-100">
                {result.signatureAlgorithm}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Public Key
              </h3>
              <p className="mt-1 text-base text-zinc-900 dark:text-zinc-100">
                {result.publicKeyAlgorithm}
                {result.publicKeySize ? ` ${result.publicKeySize}-bit` : ""}
              </p>
            </div>

            <div className="sm:col-span-2">
              <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Subject Alternative Names
              </h3>
              <div className="mt-1 flex flex-wrap gap-2">
                {formatSans(result.sans).map((san, idx) => (
                  <span
                    key={idx}
                    className="rounded-md bg-zinc-100 px-2.5 py-1 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                  >
                    {san}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
