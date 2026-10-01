#!/usr/bin/env node
/**
 * Sets the app's user-facing version (the "1.0.2" shown in the stores) in the
 * three places that carry it: app.json, the iOS Info.plist and the Android
 * build.gradle. The native folders are committed, so EAS reads the version
 * from them, not from app.json — all three have to agree.
 *
 *   pnpm bump-version          1.0.2 -> 1.0.3
 *   pnpm bump-version 1.1.0    set an exact version
 *
 * Build numbers are separate and need nothing: EAS raises them on every
 * production build (`autoIncrement` in eas.json).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLIST = join(root, "ios/WesternUSIInstaller/Info.plist");
const GRADLE = join(root, "android/app/build.gradle");
const APP_JSON = join(root, "app.json");

const plistPattern = /(<key>CFBundleShortVersionString<\/key>\s*<string>)([^<]+)(<\/string>)/;
const gradlePattern = /(versionName ")([^"]+)(")/;

const plist = readFileSync(PLIST, "utf8");
const gradle = readFileSync(GRADLE, "utf8");
const appJson = JSON.parse(readFileSync(APP_JSON, "utf8"));

const current = plistPattern.exec(plist)?.[2];
if (!current || !gradlePattern.test(gradle)) {
  console.error("Could not find the version in Info.plist / build.gradle. Nothing changed.");
  process.exit(1);
}

let next = process.argv[2];
if (next === undefined) {
  const [major, minor, patch] = current.split(".").map(Number);
  next = `${major}.${minor}.${patch + 1}`;
}
if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`"${next}" is not a version like 1.0.2. Nothing changed.`);
  process.exit(1);
}

writeFileSync(PLIST, plist.replace(plistPattern, `$1${next}$3`));
writeFileSync(GRADLE, gradle.replace(gradlePattern, `$1${next}$3`));
appJson.expo.version = next;
writeFileSync(APP_JSON, `${JSON.stringify(appJson, null, 2)}\n`);

console.log(`App version: ${current} -> ${next}`);
