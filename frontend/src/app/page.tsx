import IdentityTable from "@/components/IdentityTable";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Dashboard
          </h1>
          <p className="text-base text-zinc-500 dark:text-zinc-400">
            Manage Fabric CA identities, registrations, and enrollments
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-base font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            📝 Register
          </Link>
          <Link
            href="/enroll"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-5 py-3 text-base font-medium text-zinc-700 hover:bg-zinc-50 transition-colors dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            🔐 Enroll
          </Link>
        </div>
      </div>

      {/* Identity Table */}
      <IdentityTable />
    </div>
  );
}
