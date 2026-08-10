"use client";

import { useState, useEffect } from "react";
import { getCAInfo } from "@/lib/api";

interface CADetails {
  CAName: string;
}

interface Props {
  onClose: () => void;
}

export default function CAInfoModal({ onClose }: Props) {
  const [caInfo, setCAInfo] = useState<CADetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        setLoading(true);
        const res = await getCAInfo();
        const result = res?.result as unknown as CADetails;
        setCAInfo(result || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch CA info");
      } finally {
        setLoading(false);
      }
    };
    fetchInfo();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            CA Server Details
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors dark:hover:bg-zinc-900"
          >
            ✕
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
              <p className="text-base text-zinc-500">Loading CA info…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 p-4 text-base text-red-700 dark:bg-red-950/50 dark:text-red-400">
            ❌ {error}
          </div>
        )}

        {caInfo && !loading && (
          <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              CA Name
            </p>
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {caInfo.CAName || "N/A"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
