import { Redirect, Stack } from "expo-router";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";

import { AuthLoadingView } from "@/components/auth-loading";

export default function AuthRoutesLayout() {
  return (
    <>
      <Authenticated>
        <Redirect href="/" />
      </Authenticated>
      <Unauthenticated>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#8AAAFA" },
          }}
        />
      </Unauthenticated>
      <AuthLoading>
        <AuthLoadingView />
      </AuthLoading>
    </>
  );
}
