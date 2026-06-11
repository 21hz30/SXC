"use client";

import { tx } from "@/lib/i18n";
import { useLocale } from "@/components/I18nRuntime";

/**
 * A submit button that asks for confirmation before letting the form submit.
 * Works inside a server-action <form> because it only intercepts the click.
 * The message goes through the i18n dictionary (native confirm() dialogs are
 * outside the DOM, so the runtime can't translate them).
 */
export default function ConfirmSubmit({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [locale] = useLocale();
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(tx(message, locale))) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
