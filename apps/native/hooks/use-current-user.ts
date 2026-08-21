import { useUser } from "@clerk/expo";
import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Doc } from "@usi-installer/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";

export type UserRole = NonNullable<Doc<"users">["role"]>;

interface UseCurrentUserResult {
  isLoaded: boolean;
  isSignedIn: boolean;
  role: UserRole | undefined;
  clerkUser: ReturnType<typeof useUser>["user"];
  convexUser: Doc<"users"> | null | undefined;
}

/** Combines Clerk's session state with the synced Convex user row (which is where `role` lives). */
export function useCurrentUser(): UseCurrentUserResult {
  const { isLoaded: isClerkLoaded, isSignedIn, user: clerkUser } = useUser();
  const convexUser = useQuery(api.users.getCurrentUser, isSignedIn ? {} : "skip");

  const isLoaded = isClerkLoaded && (isSignedIn ? convexUser !== undefined : true);
  return {
    isLoaded,
    isSignedIn: !!isSignedIn,
    role: convexUser?.role,
    clerkUser,
    convexUser,
  };
}
