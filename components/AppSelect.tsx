"use client";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";

export interface SelectOption {
  value: string;
  label: string;
}

interface AppSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Extra classes applied to the trigger button */
  triggerClass?: string;
  /** Wrapper div class (for sizing like max-w-[180px]) */
  className?: string;
}

export default function AppSelect({
  value,
  onChange,
  options,
  triggerClass = "bg-zinc-800 border-zinc-700",
  className = "",
}: AppSelectProps) {
  const selected = options.find(o => o.value === value);

  return (
    <Listbox value={value} onChange={onChange}>
      <div className={`relative ${className}`}>
        <ListboxButton
          className={`w-full min-h-[44px] border text-white text-sm px-3 py-2 rounded-lg text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-1 focus:ring-zinc-600 hover:border-zinc-600 transition-colors ${triggerClass}`}
        >
          <span className="truncate">{selected?.label ?? ""}</span>
          <svg
            className="w-4 h-4 text-zinc-500 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </ListboxButton>

        <ListboxOptions className="absolute z-[999] left-0 top-full mt-1 w-full max-h-60 overflow-auto bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl focus:outline-none">
          {options.map(opt => (
            <ListboxOption
              key={opt.value}
              value={opt.value}
              className="px-3 py-2.5 text-sm text-white cursor-pointer data-[focus]:bg-zinc-800 data-[selected]:font-semibold"
            >
              {opt.label}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
