import { Button } from "@usi-installer/ui/components/button";
import { Input } from "@usi-installer/ui/components/input";
import { Plus, X } from "lucide-react";
import { useState } from "react";

interface EquipmentFieldProps {
  items: string[];
  onChange: (items: string[]) => void;
}

/** Chip list with an add box, matching "Equipment Required" in the design. */
export function EquipmentField({ items, onChange }: EquipmentFieldProps) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim();
    if (value === "" || items.includes(value)) {
      setDraft("");
      return;
    }
    onChange([...items, value]);
    setDraft("");
  }

  return (
    <div>
      <p className="text-sm font-semibold text-gray-900">Equipment Required</p>
      <p className="mt-0.5 text-xs text-gray-500">List all equipment required for installation.</p>

      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 py-1 pr-1.5 pl-2.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200 ring-inset"
            >
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(items.filter((existing) => existing !== item))}
                className="rounded-sm p-0.5 text-blue-500 hover:bg-blue-100 hover:text-blue-800"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Add equipment item"
          className="h-9 flex-1 text-sm"
        />
        <Button variant="outline" size="sm" className="gap-1.5" onClick={add}>
          <Plus className="size-3.5" />
          Add Item
        </Button>
      </div>
    </div>
  );
}
