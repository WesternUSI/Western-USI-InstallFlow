import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { FormField } from "@/components/whs/whs-ui";
import { parseDisplayDate } from "@/lib/whs-format";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** `dd/mm/yyyy`, the way the WHS forms hold a date (decision U3). */
function toDisplay(year: number, month: number, day: number) {
  return `${pad(day)}/${pad(month + 1)}/${year}`;
}

/**
 * A date field that opens a calendar (decision U3). Built from plain React
 * Native, so it needs no new native module. The value stays `dd/mm/yyyy`
 * text, the same as the typed fields it replaces. `optional` adds a Clear
 * button, e.g. for an expiry date that doesn't apply.
 */
export function DateField({
  label,
  value,
  onChange,
  placeholder = "Select a date",
  error,
  optional,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  optional?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedIso = parseDisplayDate(value);
  const today = new Date();
  const start = selectedIso === null ? today : new Date(`${selectedIso}T00:00:00`);
  const [year, setYear] = useState(start.getFullYear());
  const [month, setMonth] = useState(start.getMonth());

  const openCalendar = () => {
    const shown = selectedIso === null ? today : new Date(`${selectedIso}T00:00:00`);
    setYear(shown.getFullYear());
    setMonth(shown.getMonth());
    setOpen(true);
  };

  const step = (months: number) => {
    const next = new Date(year, month + months, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  // Monday-first grid: blanks before the 1st, then each day of the month.
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  const isSelected = (day: number) => value === toDisplay(year, month, day);

  return (
    <>
      <FormField
        label={label}
        value={value}
        placeholder={placeholder}
        icon="calendar-outline"
        onPress={openCalendar}
        error={error}
      />

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 items-center justify-center bg-black/40 px-4" onPress={() => setOpen(false)}>
          <Pressable className="w-full max-w-[380px] rounded-[20px] bg-white p-4" onPress={() => undefined}>
            <Text className="mb-3 text-[16px] font-bold text-[#0f172a]">{label}</Text>

            <View className="flex-row items-center justify-between">
              <View className="flex-row">
                <Pressable accessibilityRole="button" accessibilityLabel="Previous year" onPress={() => step(-12)} className="p-2">
                  <Ionicons name="play-back" size={16} color="#2563eb" />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => step(-1)} className="p-2">
                  <Ionicons name="chevron-back" size={20} color="#2563eb" />
                </Pressable>
              </View>
              <Text className="text-[16px] font-semibold text-[#111827]">
                {MONTHS[month]} {year}
              </Text>
              <View className="flex-row">
                <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => step(1)} className="p-2">
                  <Ionicons name="chevron-forward" size={20} color="#2563eb" />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Next year" onPress={() => step(12)} className="p-2">
                  <Ionicons name="play-forward" size={16} color="#2563eb" />
                </Pressable>
              </View>
            </View>

            <View className="mt-2 flex-row">
              {WEEKDAYS.map((weekday) => (
                <Text key={weekday} className="flex-1 text-center text-[12px] font-medium text-[#64748b]">
                  {weekday}
                </Text>
              ))}
            </View>

            {Array.from({ length: cells.length / 7 }, (_, row) => (
              <View key={row} className="mt-1 flex-row">
                {cells.slice(row * 7, row * 7 + 7).map((day, index) => (
                  <View key={index} className="flex-1 items-center">
                    {day === null ? (
                      <View className="h-10 w-10" />
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${day} ${MONTHS[month]} ${year}`}
                        onPress={() => {
                          onChange(toDisplay(year, month, day));
                          setOpen(false);
                        }}
                        className="h-10 w-10 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: isSelected(day) ? "#2563eb" : "transparent",
                          borderWidth: isToday(day) && !isSelected(day) ? 1 : 0,
                          borderColor: "#2563eb",
                        }}
                      >
                        <Text
                          className="text-[15px]"
                          style={{ color: isSelected(day) ? "#ffffff" : "#111827" }}
                        >
                          {day}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            ))}

            <View className="mt-3 flex-row justify-between">
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onChange(toDisplay(today.getFullYear(), today.getMonth(), today.getDate()));
                  setOpen(false);
                }}
                className="px-2 py-2"
              >
                <Text className="text-[15px] font-semibold text-[#2563eb]">Today</Text>
              </Pressable>
              <View className="flex-row">
                {optional && value !== "" ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      onChange("");
                      setOpen(false);
                    }}
                    className="px-2 py-2"
                  >
                    <Text className="text-[15px] font-semibold text-[#dc2626]">Clear</Text>
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" onPress={() => setOpen(false)} className="px-2 py-2">
                  <Text className="text-[15px] font-semibold text-[#64748b]">Cancel</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
