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
      <p className="text-base font-bold text-slate-900">Equipment Required</p>
      <p className="mt-0.5 text-sm text-slate-500">List all equipment required for installation.</p>

      {items.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="group inline-flex items-center gap-1.5 rounded-md bg-blue-50 py-1.5 pr-2 pl-3 text-sm font-medium text-blue-700"
            >
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(items.filter((existing) => existing !== item))}
                className="rounded-sm p-0.5 text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-800"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
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
          className="h-[38px] flex-1 rounded-lg text-sm"
        />
        <Button variant="outline" className="h-[38px] gap-1.5 rounded-lg" onClick={add}>
          <Plus className="size-4" />
          Add Item
        </Button>
      </div>
    </div>
  );
}
