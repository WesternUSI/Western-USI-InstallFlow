import { useClerk } from "@clerk/react";
import { api } from "@usi-installer/backend/convex/_generated/api";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@usi-installer/ui/components/button";
import { Input } from "@usi-installer/ui/components/input";
import { useAction } from "convex/react";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** Mandatory gate shown instead of the admin panel while the signed-in
 * user's `must_change_password` is set (on invite and on every credential
 * reset). Clearing the flag re-renders `_auth/route.tsx` into the panel. */
export function ChangePasswordScreen() {
  const completePasswordChange = useAction(api.users.completePasswordChange);
  const { signOut } = useClerk();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit = newPassword !== "" && newPassword === confirmPassword && !isSaving;

  async function handleSubmit() {
    if (!canSubmit) return;

    setIsSaving(true);
    try {
      await completePasswordChange({ new_password: newPassword });
      toast.success("Password updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't update your password. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    void navigate({ to: "/login" });
  }

  return (
    <div className="flex h-full items-center justify-center bg-[#FAFAFA] px-6">
      <form
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-bold text-slate-900">Set your own password</h1>
          <p className="text-sm text-slate-500">
            You're signed in with a temporary password. Set your own before continuing.
          </p>
        </div>

        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="New password"
            className="h-[38px] rounded-lg pr-10 text-sm"
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 hover:text-slate-700"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <Input
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Confirm new password"
          className="h-[38px] rounded-lg text-sm"
        />
        {mismatch && <p className="text-xs font-medium text-red-600">Passwords don't match.</p>}

        <Button type="submit" className="h-[38px] rounded-lg" disabled={!canSubmit}>
          {isSaving ? "Saving…" : "Update Password"}
        </Button>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
