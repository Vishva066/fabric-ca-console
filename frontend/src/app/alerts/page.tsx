"use client";

import { useEffect, useState } from "react";
import { getAlertSettings, sendTestAlert, updateAlertSettings } from "@/lib/api";
import type { AlertSettings } from "@/lib/types";

const defaults: AlertSettings = {
  enabled: false,
  smtp_host: "",
  smtp_port: 587,
  smtp_username: "",
  from: "",
  recipients: [],
  expiry_days: 15,
  check_interval_hours: 24,
  password_configured: false,
};

export default function AlertsPage() {
  const [settings, setSettings] = useState<AlertSettings>(defaults);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    getAlertSettings()
      .then((response) => setSettings({ ...defaults, ...response.result, recipients: response.result.recipients ?? [] }))
      .catch((error) => setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to load alert settings" }))
      .finally(() => setLoading(false));
  }, []);

  const update = <K extends keyof AlertSettings>(key: K, value: AlertSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await updateAlertSettings({
        enabled: settings.enabled,
        smtp_host: settings.smtp_host,
        smtp_port: settings.smtp_port,
        smtp_username: settings.smtp_username,
        smtp_password: password || undefined,
        from: settings.from,
        recipients: settings.recipients,
        expiry_days: settings.expiry_days,
        check_interval_hours: settings.check_interval_hours,
      });
      setSettings(response.result);
      setPassword("");
      setMessage({ type: "success", text: "Alert settings saved" });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to save alert settings" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const response = await sendTestAlert();
      setMessage({ type: "success", text: response.message });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to send test alert" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-zinc-500">Loading alert settings...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Alerts</h1>
        <p className="mt-1 text-base text-zinc-500 dark:text-zinc-400">
          Send an SMTP alert when certificates expire or enter the configured expiry window.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <label className="flex items-center gap-3 text-base font-medium text-zinc-800 dark:text-zinc-200">
          <input type="checkbox" checked={settings.enabled} onChange={(event) => update("enabled", event.target.checked)} className="h-4 w-4 rounded border-zinc-300 text-indigo-600" />
          Enable certificate expiry alerts
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="SMTP host" value={settings.smtp_host} onChange={(value) => update("smtp_host", value)} placeholder="smtp.example.com" />
          <NumberField label="SMTP port" value={settings.smtp_port} onChange={(value) => update("smtp_port", value)} />
          <Field label="SMTP username" value={settings.smtp_username} onChange={(value) => update("smtp_username", value)} />
          <Field label="Sender address" value={settings.from} onChange={(value) => update("from", value)} placeholder="alerts@example.com" type="email" />
          <Field label={settings.password_configured ? "SMTP password (leave blank to keep)" : "SMTP password"} value={password} onChange={setPassword} type="password" />
          <NumberField label="Alert before expiry (days)" value={settings.expiry_days} onChange={(value) => update("expiry_days", value)} />
          <NumberField label="Check interval (hours)" value={settings.check_interval_hours} onChange={(value) => update("check_interval_hours", value)} />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Recipients</label>
          <textarea
            value={(settings.recipients ?? []).join(", ")}
            onChange={(event) => update("recipients", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))}
            placeholder="admin@example.com, ops@example.com"
            rows={3}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <p className="mt-1 text-sm text-zinc-500">Separate multiple addresses with commas. The default expiry window is 15 days.</p>
        </div>

        {message && <p className={message.type === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{message.text}</p>}

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "Saving..." : "Save alerts"}</button>
          <button type="button" onClick={handleTest} disabled={testing} className="rounded-lg border border-zinc-300 px-5 py-2.5 font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900">{testing ? "Sending..." : "Send test alert"}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
      {label}
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base font-normal dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
      {label}
      <input type="number" min={1} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base font-normal dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
    </label>
  );
}
