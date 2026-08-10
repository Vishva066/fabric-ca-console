import RegisterForm from "@/components/RegisterForm";
import Link from "next/link";

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="rounded-lg border border-zinc-200 p-2 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors dark:border-zinc-800 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
        >
          ←
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Register Identity
          </h1>
          <p className="text-base text-zinc-500 dark:text-zinc-400">
            Register a new identity with the Fabric CA server
          </p>
        </div>
      </div>

      {/* Registration Form */}
      <div>
        <RegisterForm />
      </div>
    </div>
  );
}
