import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/utils/cn";

const controlBase =
  "block w-full rounded-sm border border-line-strong bg-surface text-[0.9375rem] text-ink-950 outline-none transition-[border-color,box-shadow] duration-150 " +
  "placeholder:text-ink-400 hover:border-ink-400 focus:border-ink-950 focus:shadow-[0_0_0_3px_rgb(84_70_255/0.14)] " +
  "disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-500 aria-invalid:border-danger aria-invalid:focus:shadow-[0_0_0_3px_rgb(190_42_42/0.14)]";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-[0.8125rem] font-medium text-ink-800", className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlBase, "h-11 px-3.5", className)} {...props} />;
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(controlBase, "min-h-24 px-3.5 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(controlBase, "h-11 appearance-none pl-3.5 pr-10", className)} {...props}>
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-3.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function FieldError({ id, messages }: { id?: string; messages?: string[] | string | null }) {
  const list = Array.isArray(messages) ? messages : messages ? [messages] : [];
  if (list.length === 0) return null;
  return (
    <p id={id} className="mt-1.5 text-[0.8125rem] text-danger">
      {list[0]}
    </p>
  );
}

type FieldProps = {
  label: ReactNode;
  htmlFor: string;
  error?: string[] | string | null;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
  children: ReactNode;
};

export function Field({ label, htmlFor, error, hint, optional, className, children }: FieldProps) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>
        {label}
        {optional && <span className="ml-1 font-normal text-ink-400">(optional)</span>}
      </Label>
      {children}
      {hint && !error && <p className="mt-1.5 text-[0.8125rem] text-ink-500">{hint}</p>}
      <FieldError id={`${htmlFor}-error`} messages={error} />
    </div>
  );
}

type TextFieldProps = Omit<ComponentProps<"input">, "id"> & {
  name: string;
  label: ReactNode;
  id?: string;
  error?: string[] | string | null;
  hint?: ReactNode;
  optional?: boolean;
  wrapperClassName?: string;
};

export function TextField({ name, label, id, error, hint, optional, wrapperClassName, ...props }: TextFieldProps) {
  const fieldId = id ?? `field-${name}`;
  const hasError = Array.isArray(error) ? error.length > 0 : !!error;
  return (
    <Field label={label} htmlFor={fieldId} error={error} hint={hint} optional={optional} className={wrapperClassName}>
      <Input
        id={fieldId}
        name={name}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? `${fieldId}-error` : undefined}
        {...props}
      />
    </Field>
  );
}

export function Checkbox({ className, label, id, ...props }: Omit<ComponentProps<"input">, "type"> & { label?: ReactNode }) {
  const input = (
    <input
      id={id}
      type="checkbox"
      className={cn(
        "size-[1.125rem] shrink-0 cursor-pointer appearance-none rounded-xs border border-line-strong bg-surface bg-center bg-no-repeat transition-colors",
        "checked:border-ink-950 checked:bg-ink-950 checked:bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2016%2016%22%20fill=%22none%22%20stroke=%22white%22%20stroke-width=%222.2%22%3E%3Cpath%20d=%22m3.5%208.5%203%203%206-7%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22/%3E%3C/svg%3E')]",
        "hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
  if (!label) return input;
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-start gap-2.5 text-[0.9375rem] leading-snug text-ink-800">
      <span className="mt-[0.1rem] flex">{input}</span>
      <span>{label}</span>
    </label>
  );
}

export function Radio({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  return (
    <input
      type="radio"
      className={cn(
        "size-[1.125rem] shrink-0 cursor-pointer appearance-none rounded-full border border-line-strong bg-surface transition-[border-color,box-shadow]",
        "checked:border-ink-950 checked:shadow-[inset_0_0_0_4px_var(--color-surface),inset_0_0_0_10px_var(--color-ink-950)]",
        "hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
