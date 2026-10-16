/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accreditationTypes from "../accreditationTypes.js";
import type * as accreditations from "../accreditations.js";
import type * as agreements from "../agreements.js";
import type * as crons from "../crons.js";
import type * as derive from "../derive.js";
import type * as documents from "../documents.js";
import type * as email from "../email.js";
import type * as emails from "../emails.js";
import type * as geo from "../geo.js";
import type * as healthCheck from "../healthCheck.js";
import type * as http from "../http.js";
import type * as imageMigration from "../imageMigration.js";
import type * as imports from "../imports.js";
import type * as insurance from "../insurance.js";
import type * as kits from "../kits.js";
import type * as medicalCentres from "../medicalCentres.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as panelIds from "../panelIds.js";
import type * as permissions from "../permissions.js";
import type * as privateData from "../privateData.js";
import type * as releaseTime from "../releaseTime.js";
import type * as scheduledImports from "../scheduledImports.js";
import type * as sites from "../sites.js";
import type * as subcontractors from "../subcontractors.js";
import type * as teams from "../teams.js";
import type * as users from "../users.js";
import type * as vehicles from "../vehicles.js";
import type * as whsAdmin from "../whsAdmin.js";
import type * as whsAssetReminders from "../whsAssetReminders.js";
import type * as whsDates from "../whsDates.js";
import type * as whsDemo from "../whsDemo.js";
import type * as whsDocReminders from "../whsDocReminders.js";
import type * as whsEdits from "../whsEdits.js";
import type * as whsKitReminders from "../whsKitReminders.js";
import type * as whsLinks from "../whsLinks.js";
import type * as whsReminders from "../whsReminders.js";
import type * as whsReports from "../whsReports.js";
import type * as whsStatus from "../whsStatus.js";
import type * as workorders from "../workorders.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accreditationTypes: typeof accreditationTypes;
  accreditations: typeof accreditations;
  agreements: typeof agreements;
  crons: typeof crons;
  derive: typeof derive;
  documents: typeof documents;
  email: typeof email;
  emails: typeof emails;
  geo: typeof geo;
  healthCheck: typeof healthCheck;
  http: typeof http;
  imageMigration: typeof imageMigration;
  imports: typeof imports;
  insurance: typeof insurance;
  kits: typeof kits;
  medicalCentres: typeof medicalCentres;
  migrations: typeof migrations;
  notifications: typeof notifications;
  panelIds: typeof panelIds;
  permissions: typeof permissions;
  privateData: typeof privateData;
  releaseTime: typeof releaseTime;
  scheduledImports: typeof scheduledImports;
  sites: typeof sites;
  subcontractors: typeof subcontractors;
  teams: typeof teams;
  users: typeof users;
  vehicles: typeof vehicles;
  whsAdmin: typeof whsAdmin;
  whsAssetReminders: typeof whsAssetReminders;
  whsDates: typeof whsDates;
  whsDemo: typeof whsDemo;
  whsDocReminders: typeof whsDocReminders;
  whsEdits: typeof whsEdits;
  whsKitReminders: typeof whsKitReminders;
  whsLinks: typeof whsLinks;
  whsReminders: typeof whsReminders;
  whsReports: typeof whsReports;
  whsStatus: typeof whsStatus;
  workorders: typeof workorders;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
