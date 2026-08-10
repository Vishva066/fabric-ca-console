"use client";

import { useState } from "react";
import { enrollIdentity } from "@/lib/api";

const IDENTITY_TYPES = ["client", "peer", "orderer", "user", "admin"];

export default function EnrollForm() {
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [orgName, setOrgName] = useState("");
  const [identityType, setIdentityType] = useState("client");
  const [csrHostsInput, setCsrHostsInput] = useState("");
  const [csrOrganization, setCsrOrganization] = useState("");
  const [csrOrganizationalUnit, setCsrOrganizationalUnit] = useState("");
  const [csrCountry, setCsrCountry] = useState("");
  const [csrState, setCsrState] = useState("");
  const [mspDir, setMspDir] = useState("");
  const [skipTlsCaCert, setSkipTlsCaCert] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
    details?: Record<string, unknown>;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!id.trim() || !secret.trim() || !orgName.trim()) {
      setResult({
        type: "error",
        message: "ID, Secret, and Organization Name are required",
      });
      return;
    }

    try {
      setLoading(true);
      setResult(null);

      const csrHosts = csrHostsInput
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean);

      const csrNames = {
        organization: csrOrganization.trim(),
        organizational_unit: csrOrganizationalUnit.trim(),
        country: csrCountry.trim(),
        state: csrState.trim(),
      };

      const hasCSRNamesOverride = Object.values(csrNames).some(Boolean);

      const res = await enrollIdentity({
        id: id.trim(),
        secret: secret.trim(),
        org_name: orgName.trim(),
        identity_type: identityType,
        ...(csrHosts.length > 0 ? { csr_hosts: csrHosts } : {}),
        ...(hasCSRNamesOverride ? { csr_names: csrNames } : {}),
        ...(mspDir.trim() ? { msp_dir: mspDir.trim() } : {}),
        ...(skipTlsCaCert ? { skip_tls_ca_cert: true } : {}),
      });

      const mspPath = res?.result?.MSPPath as string | undefined;

      setResult({
        type: "success",
        message: `Identity '${id}' enrolled successfully`,
        details: mspPath ? { MSPPath: mspPath } : undefined,
      });

      // Reset form
      setId("");
      setSecret("");
      setOrgName("");
      setIdentityType("client");
      setCsrHostsInput("");
      setCsrOrganization("");
      setCsrOrganizationalUnit("");
      setCsrCountry("");
      setCsrState("");
      setMspDir("");
      setSkipTlsCaCert(false);
    } catch (err) {
      setResult({
        type: "error",
        message: err instanceof Error ? err.message : "Enrollment failed",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Enroll Identity
        </h2>
        <p className="text-base text-zinc-500 dark:text-zinc-400">
          Enroll a registered identity to generate its MSP credentials
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Enrollment ID */}
        <div>
          <label className="block text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            Enrollment ID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="e.g. user1"
            required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        {/* Secret */}
        <div>
          <label className="block text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            Enrollment Secret <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Enter secret"
            required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        {/* Organization Name */}
        <div>
          <label className="block text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            Organization Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="e.g. org1"
            required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        {/* Identity Type */}
        <div>
          <label className="block text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            Identity Type
          </label>
          <select
            value={identityType}
            onChange={(e) => setIdentityType(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {IDENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            CSR Hosts (SAN)
          </label>
          <input
            type="text"
            value={csrHostsInput}
            onChange={(e) => setCsrHostsInput(e.target.value)}
            placeholder="peer0.org1.example.com, 127.0.0.1"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Optional. Comma-separated DNS names or IPs to include in CSR SAN.
          </p>
        </div>
      </div>

      {/* MSP Output Directory */}
      <div className="mt-5">
        <label className="block text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
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
          Optional. If provided, MSP files are written under this directory instead of{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">FABRIC_CERT_BASE_DIR</code>.
        </p>
      </div>

      {/* Skip TLS CA Cert */}
      <div className="mt-5">
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
          Optional. If checked, the identity&apos;s MSP folder is created without a{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">tlscacerts</code> entry.
        </p>
      </div>

      <div className="mt-5 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <h3 className="text-base font-medium text-zinc-800 dark:text-zinc-200">
          CSR Subject Name Overrides (Optional)
        </h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Default CSR subject values are C=US, ST=North Carolina,
          O=Hyperledger, OU=Fabric. Fill any field below only if you want to
          override these defaults.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <input
            type="text"
            value={csrOrganization}
            onChange={(e) => setCsrOrganization(e.target.value)}
            placeholder="Organization (O)"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <input
            type="text"
            value={csrOrganizationalUnit}
            onChange={(e) => setCsrOrganizationalUnit(e.target.value)}
            placeholder="Organizational Unit (OU)"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <input
            type="text"
            value={csrCountry}
            onChange={(e) => setCsrCountry(e.target.value)}
            placeholder="Country (C)"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <input
            type="text"
            value={csrState}
            onChange={(e) => setCsrState(e.target.value)}
            placeholder="State/Province (ST)"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
      </div>

      {/* Result */}
      {result && (
        <div
          className={`mt-5 rounded-lg p-3 text-base ${
            result.type === "success"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
              : "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400"
          }`}
        >
          <p>
            {result.type === "success" ? "✅" : "❌"} {result.message}
          </p>
          {result.details?.MSPPath ? (
            <p className="mt-2 text-xs font-mono break-all opacity-80">
              MSP Path: {String(result.details.MSPPath)}
            </p>
          ) : null}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-3 text-base font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Enrolling…" : "Enroll Identity"}
      </button>
    </form>
  );
}
