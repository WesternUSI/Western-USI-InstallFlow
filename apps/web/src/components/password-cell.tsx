import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * The account password as set when the user was invited, masked with a copy
 * button — the admin handing the account over needs to read it out, not read
 * it off the screen.
 */
export function PasswordCell({ password }: { password: string | undefined }) {
  const [copied, setCopied] = useState(false);

  if (password === undefined || password === "") {
    return <span className="text-sm text-slate-400">Not set</span>;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(password as string);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused; nothing useful to show in a table cell.
    }
  }

  return (
    <span className="flex items-center gap-2">
      <span className="font-mono text-sm tracking-[2px] text-slate-500">
        {"•".repeat(Math.min(password.length, 10))}
      </span>
      <button
        type="button"
        aria-label="Copy password"
        onClick={() => void copy()}
        className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
      </button>
    </span>
  );
}
