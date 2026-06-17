"use client";

import { useState, useRef } from "react";
import { X } from "lucide-react";

/**
 * A tag input that doubles as a picker: shows existing tags in a dropdown so you
 * reuse them instead of retyping, and lets you create a new one (which becomes
 * reusable once saved). Works two ways:
 *  - controlled: pass `value` + `onChange` (e.g. inside another client form)
 *  - uncontrolled form field: pass `defaultValue` + `name` — it renders a hidden
 *    input with the comma-joined tags for a server action to read.
 */
export default function TagCombobox({
  value: controlledValue,
  onChange,
  defaultValue,
  suggestions,
  name,
  placeholder,
}: {
  value?: string[];
  onChange?: (tags: string[]) => void;
  defaultValue?: string[];
  suggestions: string[];
  name?: string;
  placeholder?: string;
}) {
  const [internal, setInternal] = useState<string[]>(defaultValue ?? []);
  const value = controlledValue ?? internal;
  const setValue = (t: string[]) => (onChange ? onChange(t) : setInternal(t));

  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (raw: string) => {
    const tag = raw.trim().replace(/,/g, "");
    if (tag && !value.some((v) => v.toLowerCase() === tag.toLowerCase())) setValue([...value, tag]);
    setText("");
  };
  const remove = (t: string) => setValue(value.filter((x) => x !== t));

  const q = text.trim().toLowerCase();
  const matches = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()) && (!q || s.toLowerCase().includes(q)));
  const showCreate = !!q && !suggestions.some((s) => s.toLowerCase() === q) && !value.some((v) => v.toLowerCase() === q);

  return (
    <div className="relative">
      {name && <input type="hidden" name={name} value={value.join(",")} />}
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-white px-2 py-2 focus-within:border-accent cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 rounded-full pl-2.5 pr-1 py-1">
            {t}
            <button type="button" onClick={() => remove(t)} className="hover:bg-orange-200 rounded-full p-0.5"><X size={10} /></button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && text.trim()) { e.preventDefault(); add(text); }
            else if (e.key === "Backspace" && !text && value.length) remove(value[value.length - 1]);
          }}
          placeholder={value.length === 0 ? (placeholder ?? "Choose or type a tag…") : "Add tag…"}
          className="text-sm px-1 py-0.5 outline-none min-w-[9rem] flex-1 bg-transparent"
        />
      </div>
      {open && (matches.length > 0 || showCreate) && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-lg max-h-52 overflow-auto py-1">
          {matches.length === 0 && !showCreate && <div className="px-3 py-1.5 text-xs text-muted">No tags yet</div>}
          {matches.map((s) => (
            <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); add(s); }} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-background">{s}</button>
          ))}
          {showCreate && (
            <button type="button" onMouseDown={(e) => { e.preventDefault(); add(text); }} className="block w-full text-left px-3 py-1.5 text-sm text-orange-700 hover:bg-background">+ Create &ldquo;{text.trim()}&rdquo;</button>
          )}
        </div>
      )}
    </div>
  );
}
