"use client";

/**
 * A submit button that asks for confirmation before letting the form submit.
 * Works inside a server-action <form> because it only intercepts the click.
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
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
