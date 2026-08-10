"use client";

import { useState } from "react";
import { revokeIdentity, reenrollIdentity } from "@/lib/api";
import type { IdentityAttribute } from "@/lib/types";

interface IdentityInfo {
  id: string;
  type: string;
  affiliation: string;
  attrs: IdentityAttribute[];
  revoked: boolean;
}

interface Props {
  identity: IdentityInfo;
  onClose: () => void;
  onActionComplete: () => void;
}

export default function IdentityActionModal({
  identity,
  onClose,
  onActionComplete,
}: Props) {
  const [action, setAction] = useState<"idle" | "revoke" | "reenroll">("idle");
  const [orgName, setOrgName] = useState("");
  const [mspDir, setMspDir] = useState("");
  const [reason, setReason] = useState("");
  const [skipTlsCaCert, setSkipTlsCaCert] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [crlGenerated, setCrlGenerated] = useState(false);
  const [crlPath, setCrlPath] = useState<string | null>(null);
  const hasRegistrarRoles = identity.attrs.some(
    (attribute) =>
      attribute.name.toLowerCase() === "hf.registrar.roles"
  );

  const resetForm = () => {
    setAction("idle");
    setOrgName("");
    setMspDir("");
    setReason("");
    setSkipTlsCaCert(false);
    setResult(null);
    setCrlGenerated(false);
    setCrlPath(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleRevoke = async () => {
    if (!orgName.trim()) {
      setResult({ type: "error", message: "Organization name is required" });
      return;
    }

    try {
      setLoading(true);
      setResult(null);
      setCrlGenerated(false);
      setCrlPath(null);

      const revokeRes = await revokeIdentity({
        id: identity.id,
        org_name: orgName,
        identity_type: identity.type,
        reason: reason || undefined,
      });

      const generated = Boolean(revokeRes?.result?.CRL);
      const path = revokeRes?.result?.CRLPath || null;
      setCrlGenerated(generated);
      setCrlPath(path);

      setResult({
        type: "success",
        message: `Identity '${identity.id}' revoked successfully`,
      });
      setTimeout(onActionComplete, generated ? 3500 : 1500);
    } catch (err) {
      setResult({
        type: "error",
        message: err instanceof Error ? err.message : "Revocation failed",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReenroll = async () => {
    if (!orgName.trim()) {
      setResult({ type: "error", message: "Organization name is required" });
      return;
    }

    try {
      setLoading(true);
      setResult(null);
      await reenrollIdentity({
        id: identity.id,
        org_name: orgName,
        identity_type: identity.type,
        ...(mspDir.trim() ? { msp_dir: mspDir.trim() } : {}),
        ...(skipTlsCaCert ? { skip_tls_ca_cert: true } : {}),
      });
      setResult({
        type: "success",
        message: `Identity '${identity.id}' re-enrolled successfully`,
      });
      setTimeout(onActionComplete, 1500);
    } catch (err) {
      setResult({
        type: "error",
        message: err instanceof Error ? err.message : "Re-enrollment failed",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {identity.id}
            </h3>
            <p className="text-base text-zinc-500 dark:text-zinc-400">
              Type: {identity.type} •{" "}
              {identity.revoked ? (
                <span className="text-red-500">Revoked</span>
              ) : (
                <span className="text-emerald-500">Active</span>
              )}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors dark:hover:bg-zinc-900"
          >
            ✕
          </button>
        </div>

        {/* Fabric CA identity attributes */}
        <div className="mb-5 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Identity Attributes
            </h4>
            {hasRegistrarRoles && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                Registrar authority
              </span>
            )}
          </div>
          {identity.attrs.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              No attributes assigned
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {identity.attrs.map((attribute) => {
                const isRegistrarRoles =
                  attribute.name.toLowerCase() === "hf.registrar.roles";

                return (
                  <div
                    key={`${attribute.name}-${attribute.value}`}
                    className={`rounded-lg border px-3 py-2 ${
                      isRegistrarRoles
                        ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40"
                        : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950"
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span
                        className={`break-all text-sm font-semibold ${
                          isRegistrarRoles
                            ? "text-amber-900 dark:text-amber-200"
                            : "text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        {attribute.name}
                      </span>
                      {attribute.ecert !== undefined && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {attribute.ecert ? "Included in certificate" : "Not in certificate"}
                        </span>
                      )}
                    </div>
                    <p
                      className={`mt-1 wrap-break-word text-sm ${
                        isRegistrarRoles
                          ? "font-semibold text-amber-800 dark:text-amber-300"
                          : "text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {attribute.value}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Action selection (idle state) */}
        {action === "idle" && (
          <div className="flex gap-3">
            <button
              onClick={() => setAction("revoke")}
              disabled={identity.revoked}
              className="flex-1 rounded-xl border-2 border-red-200 bg-red-50 p-4 text-center transition-colors hover:border-red-400 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed dark:border-red-900 dark:bg-red-950/50 dark:hover:border-red-700"
            >
              <span className="text-2xl block mb-1">🚫</span>
              <span className="text-base font-semibold text-red-700 dark:text-red-400">
                Revoke
              </span>
            </button>
            <button
              onClick={() => setAction("reenroll")}
              className="flex-1 rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4 text-center transition-colors hover:border-indigo-400 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/50 dark:hover:border-indigo-700"
            >
              <span className="text-2xl block mb-1">🔄</span>
              <span className="text-base font-semibold text-indigo-700 dark:text-indigo-400">
                Re-Enroll
              </span>
            </button>
          </div>
        )}

        {/* Revoke form */}
        {action === "revoke" && (
          <div className="space-y-4">
            <div>
              <label className="block text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Organization Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. org1"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Reason (optional)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. key compromise"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={resetForm}
                className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-base font-medium text-zinc-600 hover:bg-zinc-50 transition-colors dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                Back
              </button>
              <button
                onClick={handleRevoke}
                disabled={loading}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-base font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Revoking…" : "Confirm Revoke"}
              </button>
            </div>
          </div>
        )}

        {/* Re-enroll form */}
        {action === "reenroll" && (
          <div className="space-y-4">
            <div>
              <label className="block text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Organization Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. org1"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                MSP Output Directory
              </label>
              <input
                type="text"
                value={mspDir}
                onChange={(e) => setMspDir(e.target.value)}
                placeholder="/path/to/custom/basedir (leave blank to use FABRIC_CERT_BASE_DIR)"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Optional. If provided, MSP files are read/written under this directory instead of{" "}
                <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">FABRIC_CERT_BASE_DIR</code>.
              </p>
            </div>
            <div>
              <label className="flex items-center gap-2 text-base font-medium text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={skipTlsCaCert}
                  onChange={(e) => setSkipTlsCaCert(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500/20 dark:border-zinc-700"
                />
                Skip TLS CA certificate
              </label>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Optional. If checked, the existing{" "}
                <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">tlscacerts</code> entry is left untouched.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={resetForm}
                className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-base font-medium text-zinc-600 hover:bg-zinc-50 transition-colors dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                Back
              </button>
              <button
                onClick={handleReenroll}
                disabled={loading}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-base font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Re-enrolling…" : "Confirm Re-Enroll"}
              </button>
            </div>
          </div>
        )}

        {/* Result message */}
        {result && (
          <div
            className={`mt-4 rounded-lg p-3 text-base ${
              result.type === "success"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                : "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400"
            }`}
          >
            {result.type === "success" ? "✅" : "❌"} {result.message}
          </div>
        )}

        {/* CRL generated notice */}
        {result?.type === "success" && crlGenerated && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/50">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              ⚠ CRL Generated
            </p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
              Apply this CRL in the channel configuration for the revocation to
              take effect.
            </p>
            {crlPath && (
              <p className="mt-1 break-all text-xs text-amber-600 dark:text-amber-500">
                Path: {crlPath}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
