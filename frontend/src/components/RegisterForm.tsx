"use client";

import { useState } from "react";
import { registerIdentity } from "@/lib/api";
import type { IdentityAttribute } from "@/lib/types";

const IDENTITY_TYPES = ["client", "peer", "orderer", "user", "admin"];

const ADMIN_ATTRIBUTE_OPTIONS = [
  {
    name: "hf.Registrar.Roles",
    label: "Registrar Roles",
    type: "list",
    placeholder: "client,user",
  },
  {
    name: "hf.Registrar.DelegateRoles",
    label: "Delegate Roles",
    type: "list",
    placeholder: "client,user",
  },
  {
    name: "hf.Registrar.Attributes",
    label: "Registrar Attributes",
    type: "list",
    placeholder: "department,role",
  },
  {
    name: "hf.GenCRL",
    label: "Generate CRL",
    type: "boolean",
    placeholder: "true",
  },
  {
    name: "hf.Revoker",
    label: "Revoker",
    type: "boolean",
    placeholder: "true",
  },
  {
    name: "hf.AffiliationMgr",
    label: "Affiliation Manager",
    type: "boolean",
    placeholder: "true",
  },
  {
    name: "hf.IntermediateCA",
    label: "Intermediate CA",
    type: "boolean",
    placeholder: "true",
  },
] as const;

export default function RegisterForm() {
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [type, setType] = useState("client");
  const [affiliation, setAffiliation] = useState("");
  const [maxEnrollments, setMaxEnrollments] = useState(-1);
  const [adminAttrs, setAdminAttrs] = useState<IdentityAttribute[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const addAdminAttribute = (name: string) => {
    if (adminAttrs.some((attribute) => attribute.name === name)) {
      return;
    }

    setAdminAttrs([...adminAttrs, { name, value: "", ecert: false }]);
  };

  const removeAdminAttribute = (index: number) => {
    setAdminAttrs(adminAttrs.filter((_, i) => i !== index));
  };

  const updateAdminAttribute = (
    index: number,
    value: string
  ) => {
    const updated = [...adminAttrs];
    updated[index] = { ...updated[index], value, ecert: false };
    setAdminAttrs(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!id.trim() || !secret.trim()) {
      setResult({ type: "error", message: "ID and Secret are required" });
      return;
    }

    try {
      setLoading(true);
      setResult(null);

      const incompleteAttribute = adminAttrs.some(
        (attribute) => !attribute.value.trim()
      );
      if (incompleteAttribute) {
        setResult({
          type: "error",
          message: "Every selected administration attribute needs a value",
        });
        return;
      }

      const cleanAttrs = adminAttrs.map((attribute) => ({
        name: attribute.name,
        value: attribute.value.trim(),
        ecert: false,
      }));

      const res = await registerIdentity({
        id: id.trim(),
        secret: secret.trim(),
        type,
        affiliation: affiliation.trim(),
        max_enrollments: maxEnrollments,
        attrs: cleanAttrs,
      });

      setResult({
        type: "success",
        message: res.message || `Identity '${id}' registered successfully`,
      });

      // Reset form
      setId("");
      setSecret("");
      setType("client");
      setAffiliation("");
      setMaxEnrollments(-1);
      setAdminAttrs([]);
    } catch (err) {
      setResult({
        type: "error",
        message: err instanceof Error ? err.message : "Registration failed",
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
          Register New Identity
        </h2>
        <p className="text-base text-zinc-500 dark:text-zinc-400">
          Register a new identity with the Fabric CA server
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

        {/* Type */}
        <div>
          <label className="block text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            Identity Type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {IDENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Affiliation */}
        <div>
          <label className="block text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            Affiliation
          </label>
          <input
            type="text"
            value={affiliation}
            onChange={(e) => setAffiliation(e.target.value)}
            placeholder="e.g. org1.department1"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        {/* Max Enrollments */}
        <div className="sm:col-span-2">
          <label className="block text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            Max Enrollments{" "}
            <span className="text-zinc-400 font-normal">(-1 = unlimited)</span>
          </label>
          <input
            type="number"
            value={maxEnrollments}
            onChange={(e) => setMaxEnrollments(parseInt(e.target.value) || -1)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
      </div>

      {/* Registration and administration attributes */}
      <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
            Registration and Administration Attributes
          </h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            These Fabric CA permissions are stored without embedding them in the enrollment certificate.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            defaultValue=""
            onChange={(event) => {
              addAdminAttribute(event.target.value);
              event.target.value = "";
            }}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">Select an attribute to add</option>
            {ADMIN_ATTRIBUTE_OPTIONS.map((option) => (
              <option
                key={option.name}
                value={option.name}
                disabled={adminAttrs.some((attribute) => attribute.name === option.name)}
              >
                {option.label} ({option.name})
              </option>
            ))}
          </select>
        </div>

        {adminAttrs.length > 0 && (
          <div className="mt-4 space-y-3">
            {adminAttrs.map((attribute, index) => {
              const option = ADMIN_ATTRIBUTE_OPTIONS.find(
                (item) => item.name === attribute.name
              );
              const isBoolean = option?.type === "boolean";

              return (
                <div
                  key={attribute.name}
                  className="grid gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center"
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      {option?.label}
                    </p>
                    <p className="break-all text-xs text-zinc-500 dark:text-zinc-400">
                      {attribute.name}
                    </p>
                  </div>
                  {isBoolean ? (
                    <select
                      value={attribute.value}
                      onChange={(event) =>
                        updateAdminAttribute(index, event.target.value)
                      }
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="">Select value</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={attribute.value}
                      onChange={(event) =>
                        updateAdminAttribute(index, event.target.value)
                      }
                      placeholder={option?.placeholder}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  )}
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      ECert: false
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAdminAttribute(index)}
                      className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
                      aria-label={`Remove ${option?.label}`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
          {result.type === "success" ? "✅" : "❌"} {result.message}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-3 text-base font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Registering…" : "Register Identity"}
      </button>
    </form>
  );
}
