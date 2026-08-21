import { useSignIn } from "@clerk/react";
import { Navigate, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@usi-installer/ui/components/button";
import { Input } from "@usi-installer/ui/components/input";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { ChevronLeft, Eye, EyeOff } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
  component: RouteComponent,
});

type Step = "email" | "code" | "password";

/**
 * Mirrors the native app's forgot-password flow 1:1 — same three steps, same
 * Clerk `resetPasswordEmailCode` sub-resource, same account-enumeration-safe
 * behavior (step 1 always advances to the code step, whether or not
 * `signIn.create` found an account).
 */
function ForgotPasswordForm() {
  const { signIn } = useSignIn();
  const navigate = useNavigate();

  const [step, setStep] = React.useState<Step>("email");
  const [emailAddress, setEmailAddress] = React.useState("");
  const [code, setCode] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  // Toggled per field, so the two can be revealed independently while
  // checking a mistyped confirmation.
  const [isNewPasswordVisible, setIsNewPasswordVisible] = React.useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = React.useState(false);

  function goBack() {
    setErrorMessage(null);
    if (step === "code") {
      setStep("email");
    } else if (step === "password") {
      setStep("code");
    } else {
      void navigate({ to: "/login" });
    }
  }

  async function handleSendCode(event: React.FormEvent) {
    event.preventDefault();
    if (!emailAddress.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const { error } = await signIn.create({ identifier: emailAddress.trim() });
      if (!error) {
        await signIn.resetPasswordEmailCode.sendCode();
      }
    } finally {
      // Same next step and copy whether or not the account exists.
      setIsSubmitting(false);
      setStep("code");
    }
  }

  async function handleVerifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
      if (error) {
        setErrorMessage(error.longMessage ?? "That code isn't right. Please try again.");
        return;
      }
      setStep("password");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendCode() {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await signIn.resetPasswordEmailCode.sendCode();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmitPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!newPassword || newPassword !== confirmPassword) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const { error } = await signIn.resetPasswordEmailCode.submitPassword({
        password: newPassword,
        signOutOfOtherSessions: true,
      });
      if (error) {
        setErrorMessage(error.longMessage ?? "Couldn't reset your password. Please try again.");
        return;
      }

      await signIn.finalize({
        navigate: () => {
          toast.success("Password reset — you're signed in with your new password.");
          navigate({ to: "/dashboard" });
        },
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#edf1f3]">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-6 sm:px-6">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="rounded-md p-1.5 text-[#1a1c1e] transition-colors hover:bg-black/5"
        >
          <ChevronLeft className="size-6" />
        </button>
        <h2 className="text-[17px] font-bold text-[#1a1c1e]">Reset Password</h2>
      </div>

      <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-4 sm:px-6">
        <div className="w-full max-w-md py-8">
          {step === "email" && (
            <form onSubmit={(event) => void handleSendCode(event)}>
              <h1 className="text-[22px] font-extrabold text-[#1a1c1e]">Forgot your password?</h1>
              <p className="mt-2 text-sm font-medium text-[#6c7278]">
                Enter your account email — if it exists, we'll send a 6-digit reset code to it.
              </p>

              {errorMessage && (
                <p className="mt-4 text-sm font-medium text-[#d32f2f]">{errorMessage}</p>
              )}

              <div className="mt-5 flex items-center rounded-[14px] border border-white bg-white px-4 shadow-sm">
                <Input
                  className="h-[52px] border-none bg-transparent p-0 text-[15px] font-medium text-[#1a1c1e] shadow-none placeholder:text-[#acb5bb] focus-visible:ring-0"
                  autoCapitalize="none"
                  autoComplete="email"
                  type="email"
                  placeholder="Email"
                  value={emailAddress}
                  onChange={(event) => setEmailAddress(event.target.value)}
                />
              </div>

              <Button
                type="submit"
                className="mt-5 h-[54px] w-full rounded-[14px] bg-[#2f5fe0] text-[17px] font-bold text-white hover:bg-[#2f5fe0]/90"
                disabled={!emailAddress.trim() || isSubmitting}
              >
                {isSubmitting ? "Sending…" : "Send Reset Code"}
              </Button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={(event) => void handleVerifyCode(event)}>
              <h1 className="text-[22px] font-extrabold text-[#1a1c1e]">Check your email</h1>
              <p className="mt-2 text-sm font-medium text-[#6c7278]">
                If an account exists for {emailAddress}, a 6-digit code is on its way. Enter it
                below.
              </p>

              {errorMessage && (
                <p className="mt-4 text-sm font-medium text-[#d32f2f]">{errorMessage}</p>
              )}

              <div className="mt-5 flex items-center rounded-[14px] border border-white bg-white px-4 shadow-sm">
                <Input
                  className="h-[52px] border-none bg-transparent p-0 text-[15px] font-medium tracking-[4px] text-[#1a1c1e] shadow-none placeholder:text-[#acb5bb] placeholder:tracking-normal focus-visible:ring-0"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </div>

              <Button
                type="submit"
                className="mt-5 h-[54px] w-full rounded-[14px] bg-[#2f5fe0] text-[17px] font-bold text-white hover:bg-[#2f5fe0]/90"
                disabled={!code.trim() || isSubmitting}
              >
                {isSubmitting ? "Verifying…" : "Verify Code"}
              </Button>

              <button
                type="button"
                onClick={() => void handleResendCode()}
                className="mt-3 w-fit text-[13px] font-semibold text-[#4d81e7]"
              >
                Resend code
              </button>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={(event) => void handleSubmitPassword(event)}>
              <h1 className="text-[22px] font-extrabold text-[#1a1c1e]">Set a new password</h1>
              <p className="mt-2 text-sm font-medium text-[#6c7278]">
                Choose a new password for your account.
              </p>

              {errorMessage && (
                <p className="mt-4 text-sm font-medium text-[#d32f2f]">{errorMessage}</p>
              )}

              <div className="mt-5 flex flex-col gap-3">
                <div className="flex items-center rounded-[14px] border border-white bg-white px-4 shadow-sm">
                  <Input
                    className="h-[52px] flex-1 border-none bg-transparent p-0 text-[15px] font-medium text-[#1a1c1e] shadow-none placeholder:text-[#acb5bb] focus-visible:ring-0"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    type={isNewPasswordVisible ? "text" : "password"}
                    placeholder="New password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={isNewPasswordVisible ? "Hide password" : "Show password"}
                    onClick={() => setIsNewPasswordVisible((visible) => !visible)}
                  >
                    {isNewPasswordVisible ? (
                      <EyeOff size={20} color="#6c7278" />
                    ) : (
                      <Eye size={20} color="#6c7278" />
                    )}
                  </button>
                </div>
                <div className="flex items-center rounded-[14px] border border-white bg-white px-4 shadow-sm">
                  <Input
                    className="h-[52px] flex-1 border-none bg-transparent p-0 text-[15px] font-medium text-[#1a1c1e] shadow-none placeholder:text-[#acb5bb] focus-visible:ring-0"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    type={isConfirmPasswordVisible ? "text" : "password"}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={isConfirmPasswordVisible ? "Hide password" : "Show password"}
                    onClick={() => setIsConfirmPasswordVisible((visible) => !visible)}
                  >
                    {isConfirmPasswordVisible ? (
                      <EyeOff size={20} color="#6c7278" />
                    ) : (
                      <Eye size={20} color="#6c7278" />
                    )}
                  </button>
                </div>
              </div>
              {passwordsMismatch && (
                <p className="mt-2 text-xs font-medium text-[#d32f2f]">Passwords don't match.</p>
              )}

              <Button
                type="submit"
                className="mt-5 h-[54px] w-full rounded-[14px] bg-[#2f5fe0] text-[17px] font-bold text-white hover:bg-[#2f5fe0]/90"
                disabled={!newPassword || newPassword !== confirmPassword || isSubmitting}
              >
                {isSubmitting ? "Resetting…" : "Reset Password"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function RouteComponent() {
  return (
    <>
      <Authenticated>
        <Navigate to="/dashboard" />
      </Authenticated>
      <Unauthenticated>
        <ForgotPasswordForm />
      </Unauthenticated>
      <AuthLoading>
        <div className="h-full bg-[#edf1f3]" />
      </AuthLoading>
    </>
  );
}
