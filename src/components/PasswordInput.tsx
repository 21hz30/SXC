"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type Props = {
  name: string;
  autoComplete?: "current-password" | "new-password";
  required?: boolean;
  minLength?: number;
  pattern?: string;
  title?: string;
  placeholder?: string;
};

export default function PasswordInput({
  name,
  autoComplete = "current-password",
  required,
  minLength,
  pattern,
  title,
  placeholder,
}: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        pattern={pattern}
        title={title}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-white px-3 py-3 pr-11 text-base outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 px-3 flex items-center text-muted hover:text-foreground"
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
