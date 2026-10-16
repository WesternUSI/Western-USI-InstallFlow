import { api } from "@usi-installer/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import {
  AlertBanner,
  DetailCard,
  NotesCard,
  OutlineButton,
  PrimaryButton,
  WhsHeader,
  WhsScreen,
} from "@/components/whs/whs-ui";
import { toUserMessage } from "@/lib/errors";
import { useAppToast } from "@/lib/toast";
import { formatIsoDate } from "@/lib/whs-format";
import { KIT_CHECKS } from "@/lib/whs-mock";

const LIMIT = 1000;

/**
 * One first-aid kit: its dates, the latest inspection and any open issue. An
 * open issue is marked resolved here; the next inspection date stays as it is
 * (decision K3).
 */
export default function KitDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const kit = useQuery(api.kits.detail, { kit_id: id ?? "" });
  const resolveIssue = useMutation(api.kits.resolveIssue);
  const { showError, showSuccess } = useAppToast();

  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  if (kit === undefined || kit === null) {
    return (
      <WhsScreen>
        <WhsHeader title="First-Aid Kit" subtitle="Kit details and inspections" />
        {kit === undefined ? (
          <ActivityIndicator className="mt-10" />
        ) : (
          <Text className="text-[15px] text-[#4b5563]">This kit could not be found.</Text>
        )}
      </WhsScreen>
    );
  }

  const handleResolve = async () => {
    if (resolution.trim() === "") {
      setError("Describe what you did to fix it, e.g. the items you replaced.");
      showError("Describe what you did to fix it, e.g. the items you replaced.");
      return;
    }
    setSubmitting(true);
    try {
      await resolveIssue({ kit_id: kit.id, resolution: resolution.trim() });
      showSuccess("Issue resolved", `Next inspection is still due ${formatIsoDate(kit.next_inspection)}.`);
      setResolving(false);
      setResolution("");
    } catch (caught) {
      showError(toUserMessage(caught, "Could not save that. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const issueTitles = (kit.open_issue?.checks ?? []).map(
    (check) => KIT_CHECKS.find((entry) => entry.id === check)?.title ?? check,
  );

  const rows: Parameters<typeof DetailCard>[0]["rows"] = [
    {
      pair: [
        { label: "Last inspection", value: kit.last_inspection ? formatIsoDate(kit.last_inspection) : "Not yet" },
        { label: "Next inspection", value: formatIsoDate(kit.next_inspection) },
      ],
    },
    { label: "Inspected every", value: `${kit.frequency_months} ${kit.frequency_months === 1 ? "month" : "months"}` },
  ];
  if (kit.latest) {
    rows.push({ label: "Last inspected by", value: kit.latest.inspected_by_name });
    rows.push({ label: "Earliest stock expiry", value: formatIsoDate(kit.latest.earliest_expiry) });
  }

  return (
    <WhsScreen>
      <WhsHeader title="First-Aid Kit" subtitle="Kit details and inspections" />

      <DetailCard
        title={`Kit ${kit.code}`}
        subtitle={`${kit.kit_type} | ${kit.location}`}
        status={kit.status}
        rows={rows}
      />

      <View className="mt-4 gap-4">
        {kit.open_issue ? (
          <View className="gap-3">
            <AlertBanner
              tone="danger"
              text={`Found on ${formatIsoDate(kit.open_issue.date)}: ${issueTitles.join(", ")}.${
                kit.open_issue.corrective_action ? ` Action needed: ${kit.open_issue.corrective_action}` : ""
              }`}
            />
            {resolving ? (
              <>
                <NotesCard
                  label="What did you do to fix it?"
                  placeholder="e.g., Replaced the expired bandages and burn gel"
                  value={resolution}
                  onChangeText={(text) => {
                    setResolution(text.slice(0, LIMIT));
                    setError(undefined);
                  }}
                  error={error}
                />
                {submitting ? (
                  <ActivityIndicator />
                ) : (
                  <PrimaryButton label="Mark Issue Resolved" onPress={() => void handleResolve()} />
                )}
              </>
            ) : (
              <PrimaryButton label="Mark Issue Resolved" onPress={() => setResolving(true)} />
            )}
          </View>
        ) : null}
        {kit.latest?.resolved_at !== undefined && kit.latest.resolution ? (
          <AlertBanner tone="success" text={`Last issue resolved: ${kit.latest.resolution}`} />
        ) : null}

        <OutlineButton
          label="Start Inspection"
          onPress={() => router.push(`/safety/kit-inspection?kit=${kit.id}` as Href)}
        />
      </View>
    </WhsScreen>
  );
}
