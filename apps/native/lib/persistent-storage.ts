import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

function getWebStorage() {
  if (typeof localStorage === "undefined") {
    return null;
  }

  return localStorage;
}

export async function getPersistentItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return getWebStorage()?.getItem(key) ?? null;
  }

  return SecureStore.getItemAsync(key);
}

export async function setPersistentItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    getWebStorage()?.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

export async function deletePersistentItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    getWebStorage()?.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}
