import { Ionicons } from "@expo/vector-icons";
import { api } from "@usi-installer/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";

import {
  AlertBanner,
  DetailCard,
  FileCard,
  ListCard,
  OutlineButton,
  PrimaryButton,
  SearchField,
  StatusPill,
  WhsHeader,
  WhsScreen,
} from "@/components/whs/whs-ui";
import { type DocumentItem, type DocumentKind, useDocuments } from "@/hooks/use-documents";
import { formatIsoDate } from "@/lib/whs-format";

const ROUTE: Record<DocumentKind, string> = {
  swms: "/safety/swms",
  sds: "/safety/sds",
  document: "/safety/documents",
};

export function documentHref(item: Pick<DocumentItem, "id" | "kind">): Href {
  return `${ROUTE[item.kind]}/${item.id}` as Href;
}

/** "SWMS-05 | PTA sites | Supersedes v1.9" */
function subtitleOf(item: DocumentItem): string {
  const parts = [item.code, item.category, item.applies_to].filter((part): part is string => !!part);
  if (item.supersedes) parts.push(`Supersedes ${item.supersedes}`);
  return parts.length > 0 ? parts.join(" | ") : `Issued ${formatIsoDate(item.issued)}`;
}

function versionLine(item: DocumentItem): string {
  return item.review_date === undefined
    ? `${item.version} - issued ${formatIsoDate(item.issued)}`
    : `${item.version} - next review ${formatIsoDate(item.review_date)}`;
}

function shortDate(time: number): string {
  const date = new Date(time);
  return formatIsoDate(
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
  );
}

export function DocListScreen({
  kind,
  title,
  subtitle,
}: {
  kind: DocumentKind;
  title: string;
  subtitle: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { items, isLoading } = useDocuments();

  const needle = query.trim().toLowerCase();
  const all = (items ?? []).filter((item) => item.kind === kind);
  const docs = all.filter((item) => item.title.toLowerCase().includes(needle));

  return (
    <WhsScreen>
      <WhsHeader title={title} subtitle={subtitle} />

      {isLoading ? (
        <ActivityIndicator className="mt-10" />
      ) : (
        <View className="gap-4">
          <SearchField placeholder="Search by title" value={query} onChangeText={setQuery} />
          {docs.map((item) => (
            <ListCard
              key={item.id}
              title={item.title}
              subtitle={subtitleOf(item)}
              label="Version"
              value={versionLine(item)}
              status={item.status}
              onPress={() => router.push(documentHref(item))}
            />
          ))}
          {docs.length === 0 ? (
            <Text className="py-6 text-center text-[14px] text-[#64748b]">
              {all.length === 0 ? "No documents yet." : "No documents match your search."}
            </Text>
          ) : null}
        </View>
      )}
    </WhsScreen>
  );
}

const CHANGE_STATE = {
  "awaiting-review": { status: "awaiting-verification", label: "Awaiting Review" },
  validated: { status: "current", label: "Validated" },
  "sent-back": { status: "action-required", label: "Sent Back" },
} as const;

export function ChangeStatePill({ state }: { state: keyof typeof CHANGE_STATE }) {
  return <StatusPill status={CHANGE_STATE[state].status} label={CHANGE_STATE[state].label} />;
}

export function DocDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useQuery(api.documents.detail, { document_id: id ?? "" });

  if (doc === undefined) {
    return (
      <WhsScreen>
        <WhsHeader title="Document" subtitle="View details of the document" />
        <ActivityIndicator className="mt-10" />
      </WhsScreen>
    );
  }

  if (doc === null) {
    return (
      <WhsScreen>
        <WhsHeader title="Document" subtitle="View details of the document" />
        <Text className="text-[15px] text-[#4b5563]">This document could not be found.</Text>
      </WhsScreen>
    );
  }

  const fileUrl = doc.file.url;
  const rows: Parameters<typeof DetailCard>[0]["rows"] = [
    { label: "Version", value: doc.supersedes ? `${doc.version} (supersedes ${doc.supersedes})` : doc.version },
    {
      pair: [
        { label: "Issued", value: formatIsoDate(doc.issued) },
        { label: "Next review", value: doc.review_date ? formatIsoDate(doc.review_date) : "Not set" },
      ],
    },
  ];
  if (doc.applies_to) rows.push({ label: "Applies to", value: doc.applies_to });

  return (
    <WhsScreen>
      <WhsHeader title="Document" subtitle="View details of the document" />

      <DetailCard
        title={doc.title}
        subtitle={[doc.code, doc.category].filter(Boolean).join(" | ") || undefined}
        status={doc.status}
        rows={rows}
      />

      <View className="mt-4 gap-4">
        <FileCard name={doc.file.name} onOpen={fileUrl ? () => void Linking.openURL(fileUrl) : undefined} />

        {doc.needs_acknowledgement ? (
          <AlertBanner tone="danger" text="You must acknowledge this version before working under it." />
        ) : null}
        {doc.acknowledged_at !== undefined ? (
          <AlertBanner tone="success" text={`Acknowledged and signed ${shortDate(doc.acknowledged_at)}`} />
        ) : null}

        <View className="gap-3">
          {fileUrl ? <OutlineButton label="Open Full Document" onPress={() => void Linking.openURL(fileUrl)} /> : null}
          {doc.needs_acknowledgement ? (
            <PrimaryButton
              label={`Acknowledge & Sign ${doc.version}`}
              onPress={() =>
                router.push(
                  `/safety/sign?version=${doc.version_id}&title=${encodeURIComponent(`${doc.title} ${doc.version}`)}` as Href,
                )
              }
            />
          ) : null}
          {doc.acknowledgement_required ? (
            <OutlineButton
              label="Raise Concern or Question"
              onPress={() =>
                router.push(`/safety/concern?document=${doc.id}&title=${encodeURIComponent(doc.title)}` as Href)
              }
            />
          ) : null}
        </View>

        {doc.kind === "swms" ? (
          <View className="mt-2 gap-3">
            <Text className="text-[18px] font-bold text-[#1a1b24]">On-site changes</Text>
            <Text className="text-[13px] leading-5 text-[#64748b]">
              Stop and record a change when access, the work area, traffic, weather, equipment, people, the method or
              the scope changes. Brief everyone affected; each of them signs it in their own app.
            </Text>
            {doc.changes.map((change) => (
              <Pressable
                key={change.id}
                accessibilityRole="button"
                onPress={() => router.push(`/safety/swms/changes/${change.id}` as Href)}
                className="rounded-[16px] border border-[#e5e7eb] bg-white p-4"
              >
                <View className="flex-row items-start justify-between gap-3">
                  <Text className="flex-1 text-[15px] font-semibold leading-5 text-[#111827]" numberOfLines={2}>
                    {change.change}
                  </Text>
                  <ChangeStatePill state={change.state} />
                </View>
                <Text className="mt-2 text-[13px] text-[#4b5563]">
                  {formatIsoDate(change.date)} {change.time} - {change.reported_by_name}
                </Text>
                <View className="mt-2 flex-row items-center gap-1">
                  <Ionicons
                    name={change.signed_by_me ? "checkmark-circle" : "create-outline"}
                    size={16}
                    color={change.signed_by_me ? "#16a34a" : "#dc2626"}
                  />
                  <Text
                    className="text-[13px] font-medium"
                    style={{ color: change.signed_by_me ? "#16a34a" : "#dc2626" }}
                  >
                    {change.signed_by_me ? "You've signed this" : "Not signed by you"}
                  </Text>
                </View>
              </Pressable>
            ))}
            <OutlineButton
              label="Record On-site Change"
              onPress={() =>
                router.push(`/safety/swms/change?document=${doc.id}&title=${encodeURIComponent(doc.title)}` as Href)
              }
            />
          </View>
        ) : null}
      </View>
    </WhsScreen>
  );
}
