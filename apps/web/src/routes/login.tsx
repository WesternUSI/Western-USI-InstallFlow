import { useSignIn } from "@clerk/react";
import { Link, Navigate, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@usi-installer/ui/components/button";
import { Checkbox } from "@usi-installer/ui/components/checkbox";
import { Input } from "@usi-installer/ui/components/input";
import { Label } from "@usi-installer/ui/components/label";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Eye, EyeOff } from "lucide-react";
import * as React from "react";

import westernUsiLogo from "@/assets/western-usi-logo.png";

const REMEMBERED_EMAIL_KEY = "usi.remembered-email";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

/** Blue wash behind the wordmark, sampled from the native app's login design. */
function HeaderGlow() {
  return (
    <svg
      width="100%"
      height="100%"
      style={{ position: "absolute", top: 0, left: 0 }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="glow" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#8AAAFA" stopOpacity="1" />
          <stop offset="0.35" stopColor="#B4D0F6" stopOpacity="1" />
          <stop offset="0.7" stopColor="#DCE9F4" stopOpacity="1" />
          <stop offset="1" stopColor="#EDF1F3" stopOpacity="1" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
    </svg>
  );
}

function LoginForm() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const navigate = useNavigate();

  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [rememberMe, setRememberMe] = React.useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  // Clerk's "Client Trust" check: a password sign-in from a browser Clerk
  // hasn't seen before comes back `needs_client_trust` rather than `complete`,
  // and is resolved with an emailed code rather than the password step itself.
  const [needsDeviceCode, setNeedsDeviceCode] = React.useState(false);
  const [deviceCode, setDeviceCode] = React.useState("");

  // Pre-fill the email from the last "Remember me" sign-in.
  React.useEffect(() => {
    const storedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (storedEmail) {
      setEmailAddress(storedEmail);
      setRememberMe(true);
    }
  }, []);

  const isSubmitting = fetchStatus === "fetching";
  const canSubmit = !!emailAddress && !!password && !isSubmitting;

  const persistRememberedEmail = () => {
    if (rememberMe) {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, emailAddress);
    } else {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
  };

  const finishSignIn = async () => {
    persistRememberedEmail();
    await signIn.finalize({
      navigate: ({ session }) => {
        if (session?.currentTask) {
          console.log(session.currentTask);
          return;
        }

        navigate({ to: "/dashboard" });
      },
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatusMessage(null);

    const { error } = await signIn.password({ emailAddress, password });

    if (error) {
      setStatusMessage(error.longMessage ?? "Email or password is incorrect. Please try again.");
      return;
    }

    if (signIn.status === "needs_client_trust") {
      const hasEmailCode = signIn.supportedSecondFactors?.some(
        (factor) => factor.strategy === "email_code",
      );
      if (!hasEmailCode) {
        setStatusMessage(
          "This sign-in needs a verification method that isn't set up on this account. Please contact the office.",
        );
        return;
      }

      await signIn.mfa.sendEmailCode();
      setNeedsDeviceCode(true);
      return;
    }

    if (signIn.status !== "complete") {
      console.log("Clerk sign-in did not complete:", signIn);
      setStatusMessage(
        `Sign-in could not be completed (status: ${signIn.status ?? "unknown"}). Please contact the office.`,
      );
      return;
    }

    await finishSignIn();
  };

  const handleVerifyDevice = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatusMessage(null);

    const { error } = await signIn.mfa.verifyEmailCode({ code: deviceCode });

    if (error) {
      setStatusMessage(error.longMessage ?? "That code didn't match. Please try again.");
      return;
    }

    if (signIn.status !== "complete") {
      console.log("Clerk sign-in did not complete after device verification:", signIn);
      setStatusMessage(
        `Sign-in could not be completed (status: ${signIn.status ?? "unknown"}). Please contact the office.`,
      );
      return;
    }

    await finishSignIn();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#edf1f3]">
      <div className="relative h-[15%] max-h-[140px] min-h-[90px] shrink-0">
        <HeaderGlow />
        <div className="relative flex h-full items-end justify-center pb-3">
          <img
            src={westernUsiLogo}
            alt="Western USI"
            className="h-auto w-[70%] max-w-[270px] object-contain"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 sm:px-6">
        <div className="w-full max-w-md py-4">
          {needsDeviceCode ? (
            <>
              <h1 className="text-[26px] leading-[32px] font-extrabold text-[#1a1c1e] sm:text-[34px] sm:leading-[44px]">
                Verify this
                <br />
                Device
              </h1>
              <p className="mt-2 text-sm font-medium text-[#6c7278] sm:mt-3 sm:text-[15px]">
                We sent a code to {emailAddress} — this device hasn't signed in before.
              </p>

              {statusMessage && (
                <p className="mt-4 text-sm font-medium text-[#d32f2f]">{statusMessage}</p>
              )}

              <form className="mt-5 flex flex-col gap-3 sm:mt-7" onSubmit={handleVerifyDevice}>
                <div className="flex items-center rounded-[14px] border border-white bg-white px-4 shadow-sm">
                  <Input
                    className="h-[52px] border-none bg-transparent p-0 text-[15px] font-medium tracking-[4px] text-[#1a1c1e] shadow-none placeholder:text-[#acb5bb] placeholder:tracking-normal focus-visible:ring-0"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="Verification code"
                    value={deviceCode}
                    onChange={(event) => setDeviceCode(event.target.value)}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void signIn.mfa.sendEmailCode()}
                  className="w-fit text-[13px] font-semibold text-[#4d81e7]"
                >
                  Resend code
                </button>

                <Button
                  type="submit"
                  className="mt-5 h-[54px] rounded-[14px] bg-[#2f5fe0] text-[17px] font-bold text-white hover:bg-[#2f5fe0]/90"
                  disabled={!deviceCode || isSubmitting}
                >
                  Verify
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setNeedsDeviceCode(false);
                    setDeviceCode("");
                    setStatusMessage(null);
                  }}
                  className="mt-1 w-fit text-[13px] font-medium text-[#6c7278]"
                >
                  Back to sign in
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-[26px] leading-[32px] font-extrabold text-[#1a1c1e] sm:text-[34px] sm:leading-[44px]">
                Sign in to your
                <br />
                Account
              </h1>
              <p className="mt-2 text-sm font-medium text-[#6c7278] sm:mt-3 sm:text-[15px]">
                Enter your credentials to log in
              </p>

              {statusMessage && (
                <p className="mt-4 text-sm font-medium text-[#d32f2f]">{statusMessage}</p>
              )}

              <form className="mt-5 flex flex-col gap-3 sm:mt-7" onSubmit={handleSubmit}>
              <div className="flex items-center rounded-[14px] border border-white bg-white px-4 shadow-sm">
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
              {errors.fields.identifier && (
                <p className="text-xs font-medium text-[#d32f2f]">
                  {errors.fields.identifier.message}
                </p>
              )}

              <div className="flex items-center rounded-[14px] border border-white bg-white px-4 shadow-sm">
                <Input
                  className="h-[52px] flex-1 border-none bg-transparent p-0 text-[15px] font-medium text-[#1a1c1e] shadow-none placeholder:text-[#acb5bb] focus-visible:ring-0"
                  autoCapitalize="none"
                  autoComplete="current-password"
                  type={isPasswordVisible ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                  onClick={() => setIsPasswordVisible((visible) => !visible)}
                >
                  {isPasswordVisible ? (
                    <EyeOff size={20} color="#6c7278" />
                  ) : (
                    <Eye size={20} color="#6c7278" />
                  )}
                </button>
              </div>
              {errors.fields.password && (
                <p className="text-xs font-medium text-[#d32f2f]">{errors.fields.password.message}</p>
              )}

              <div className="mt-2 flex items-center justify-between">
                <Label htmlFor="remember-me" className="cursor-pointer">
                  <Checkbox
                    id="remember-me"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked)}
                    className="size-5 rounded-[5px] border-[1.5px] border-[#acb5bb] data-checked:border-[#2563eb] data-checked:bg-[#2563eb]"
                  />
                  <span className="text-[13px] font-medium text-[#6c7278]">Remember me</span>
                </Label>

                <Link to="/forgot-password" className="text-[13px] font-semibold text-[#4d81e7]">
                  Forgot Password ?
                </Link>
              </div>

                <Button
                  type="submit"
                  className="mt-5 h-[54px] rounded-[14px] bg-[#2f5fe0] text-[17px] font-bold text-white hover:bg-[#2f5fe0]/90"
                  disabled={!canSubmit}
                >
                  Log In
                </Button>
              </form>
            </>
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
        <LoginForm />
      </Unauthenticated>
      <AuthLoading>
        <div className="h-full bg-[#edf1f3]" />
      </AuthLoading>
    </>
  );
}
