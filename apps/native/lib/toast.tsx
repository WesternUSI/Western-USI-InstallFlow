import { toast } from "sonner-native";

/**
 * App toasts, backed by `sonner-native`. The `<Toaster richColors />` in
 * `app/_layout.tsx` gives `success` a solid green fill and `error` a solid red
 * one, with matching icons.
 *
 * `showError`'s message should already be user-safe — run it through
 * `toUserMessage` from `@/lib/errors` first so raw Convex transport strings
 * ("[CONVEX M(...)] [Request ID: ...] Server Error") never reach the screen.
 */
export function useAppToast() {
  return {
    showSuccess: (title: string, message?: string) =>
      toast.success(title, message ? { description: message } : undefined),
    showError: (title: string, message?: string) =>
      toast.error(title, message ? { description: message } : undefined),
  };
}
