"use client";

import { useState, useEffect, useCallback } from "react";
import { listIdentities, getCertificates, getCRLList } from "@/lib/api";
import IdentityActionModal from "./IdentityActionModal";
import type { CertificateInfo, IdentityAttribute } from "@/lib/types";

interface CertificateSANs {
  dns: string[];
  ip: string[];
  email: string[];
  uri: string[];
}

interface IdentityRow {
  sno: number;
  id: string;
  type: string;
  affiliation: string;
  attrs: IdentityAttribute[];
  maxEnrollments: number;
  revoked: boolean;
  crlGenerated: boolean;
  expiresOn: string;
  expiresIn: string;
  expired: boolean;
  sans: CertificateSANs;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function SANGroup({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={`${label}-${value}`}
            className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function IdentityTable() {
  const [identities, setIdentities] = useState<IdentityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdentity, setSelectedIdentity] = useState<IdentityRow | null>(
    null
  );
  const [showModal, setShowModal] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch identities, certificates, and CRL list in parallel
      const [identitiesRes, certsRes, crlRes] = await Promise.all([
        listIdentities(),
        getCertificates(),
        getCRLList(),
      ]);

      const rawIdentities = identitiesRes?.result?.identities || [];
      const rawCerts = certsRes?.result?.certs || [];
      const crlIDs = new Set((crlRes?.result?.crl_ids || []) as string[]);

      // Build a map from cert subject CN → cert info for quick lookup
      const certMap = new Map<string, CertificateInfo>();
      for (const cert of rawCerts) {
        const cn = cert.subject_cn;
        if (cn) {
          // Keep the latest cert per identity (certs come in order, last is newest)
          certMap.set(cn, cert);
        }
      }

      const rows: IdentityRow[] = rawIdentities.map(
        (identity: Record<string, unknown>, idx: number) => {
          const id = (identity.id as string) || "";
          const cert = certMap.get(id);

          // Determine revocation: check if the cert has a revoked_at field
          const revokedAt = cert?.revoked_at;
          const isRevoked = !!revokedAt && revokedAt !== "";

          // Expiry info from enriched certificate data
          const expiresOn = cert?.not_after || "N/A";
          const expiresIn = cert?.expires_in || "N/A";
          const expired = cert?.expired || false;

          const sans: CertificateSANs = {
            dns: toStringArray(cert?.dns_sans),
            ip: toStringArray(cert?.ip_sans),
            email: toStringArray(cert?.email_sans),
            uri: toStringArray(cert?.uri_sans),
          };

          return {
            sno: idx + 1,
            id,
            type: (identity.type as string) || "client",
            affiliation: (identity.affiliation as string) || "",
            attrs: Array.isArray(identity.attrs)
              ? identity.attrs.filter(
                  (attribute): attribute is IdentityAttribute =>
                    typeof attribute === "object" &&
                    attribute !== null &&
                    typeof (attribute as IdentityAttribute).name === "string" &&
                    typeof (attribute as IdentityAttribute).value === "string"
                )
              : [],
            maxEnrollments: (identity.max_enrollments as number) || 0,
            revoked: isRevoked,
            crlGenerated: crlIDs.has(id),
            expiresOn,
            expiresIn,
            expired,
            sans,
          };
        }
      );

      setIdentities(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRowClick = (identity: IdentityRow) => {
    setSelectedIdentity(identity);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedIdentity(null);
  };

  const handleActionComplete = () => {
    setShowModal(false);
    setSelectedIdentity(null);
    fetchData(); // Refresh the table
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="text-base text-zinc-500">Loading identities…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
              Failed to load identities
            </h3>
            <p className="text-base text-red-600 dark:text-red-400">{error}</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2.5 text-base font-medium text-white hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {/* Table Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              Identities
            </h2>
            <p className="text-base text-zinc-500 dark:text-zinc-400">
              {identities.length} registered{" "}
              {identities.length === 1 ? "identity" : "identities"}
            </p>
          </div>
          <button
            onClick={fetchData}
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-base font-medium text-zinc-600 hover:bg-zinc-50 transition-colors dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            ↻ Refresh
          </button>
        </div>

        {identities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <span className="text-4xl mb-3">📭</span>
            <p className="text-base text-zinc-500 dark:text-zinc-400">
              No identities found
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <th className="px-6 py-3.5 text-left text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    S.No
                  </th>
                  <th className="px-6 py-3.5 text-left text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    ID Name
                  </th>
                  <th className="px-6 py-3.5 text-left text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Type
                  </th>
                  <th className="px-6 py-3.5 text-center text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Revoked
                  </th>
                  <th className="px-6 py-3.5 text-left text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Expires On
                  </th>
                  <th className="px-6 py-3.5 text-left text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Time to Expire
                  </th>
                  <th className="px-6 py-3.5 text-left text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    SAN Valid For
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {identities.map((identity) => (
                  <tr
                    key={identity.id}
                    onClick={() => handleRowClick(identity)}
                    className="cursor-pointer transition-colors hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20"
                  >
                    <td className="px-6 py-4 text-base text-zinc-500 dark:text-zinc-400">
                      {identity.sno}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-base font-medium text-indigo-600 dark:text-indigo-400">
                        {identity.id}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {identity.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        {identity.revoked ? (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700 dark:bg-red-900/50 dark:text-red-400">
                            ● Revoked
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                            ● Active
                          </span>
                        )}
                        {identity.crlGenerated && (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                            ⚠ CRL Generated
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-base text-zinc-600 dark:text-zinc-400">
                      {identity.expiresOn !== "N/A"
                        ? new Date(identity.expiresOn).toLocaleDateString(
                            "en-IN",
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }
                          )
                        : "N/A"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-base font-medium ${
                          identity.expired
                            ? "text-red-600 dark:text-red-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {identity.expiresIn}
                      </span>
                    </td>
                    <td className="px-6 py-4 align-top">
                      {identity.sans.dns.length === 0 &&
                      identity.sans.ip.length === 0 &&
                      identity.sans.email.length === 0 &&
                      identity.sans.uri.length === 0 ? (
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">
                          No SANs
                        </span>
                      ) : (
                        <div className="max-w-md space-y-2">
                          <SANGroup label="DNS" values={identity.sans.dns} />
                          <SANGroup label="IP" values={identity.sans.ip} />
                          <SANGroup
                            label="Email"
                            values={identity.sans.email}
                          />
                          <SANGroup label="URI" values={identity.sans.uri} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action Modal */}
      {showModal && selectedIdentity && (
        <IdentityActionModal
          identity={selectedIdentity}
          onClose={handleCloseModal}
          onActionComplete={handleActionComplete}
        />
      )}
    </>
  );
}
