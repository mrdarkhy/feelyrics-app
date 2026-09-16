'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/cn';

/**
 * Form field plumbing.
 *
 * The point of this component is that the wiring cannot be forgotten: the label
 * is bound to the control, the hint and the error are referenced by
 * `aria-describedby`, and an invalid control carries `aria-invalid`. Doing that
 * by hand at each call site is how half the fields end up unlabelled.
 */

interface FieldContextValue {
  id: string;
  hintId: string;
  errorId: string;
  hasError: boolean;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

function useField(): FieldContextValue {
  const context = React.useContext(FieldContext);
  if (!context) {
    throw new Error('Field parts must be rendered inside <Field>.');
  }
  return context;
}

export interface FieldProps {
  children: React.ReactNode;
  error?: string | null;
  className?: string;
}

export function Field({ children, error, className }: FieldProps) {
  const id = React.useId();

  const value = React.useMemo(
    () => ({
      id,
      hintId: `${id}-hint`,
      errorId: `${id}-error`,
      hasError: Boolean(error),
    }),
    [id, error],
  );

  return (
    <FieldContext.Provider value={value}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        {children}
        {error ? (
          <p
            id={value.errorId}
            // `alert` so the message is announced the moment it appears, rather
            // than only when focus happens to reach the field.
            role="alert"
            className="text-[13px] font-medium text-danger"
          >
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

export function FieldLabel({
  children,
  className,
  optional,
}: {
  children: React.ReactNode;
  className?: string;
  optional?: string;
}) {
  const { id } = useField();
  return (
    <LabelPrimitive.Root
      htmlFor={id}
      className={cn('text-[13px] font-semibold text-bone', className)}
    >
      {children}
      {optional ? (
        <span className="ml-1.5 font-normal text-olive">({optional})</span>
      ) : null}
    </LabelPrimitive.Root>
  );
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  const { hintId } = useField();
  return (
    <p id={hintId} className="text-[13px] leading-relaxed text-bone-muted">
      {children}
    </p>
  );
}

const CONTROL_CLASSES =
  'w-full rounded-xl border bg-ground-raised px-3 py-2.5 text-[15px] text-bone ' +
  'placeholder:text-olive/70 transition-colors ' +
  'focus:border-amber/60 focus:outline-none focus-visible:outline-2 focus-visible:outline-amber ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

function useControlProps() {
  const { id, hintId, errorId, hasError } = useField();
  return {
    id,
    'aria-describedby': cn(hintId, hasError && errorId),
    'aria-invalid': hasError || undefined,
  } as const;
}

export const FieldInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function FieldInput({ className, ...props }, ref) {
  const { hasError } = useField();
  return (
    <input
      ref={ref}
      {...useControlProps()}
      className={cn(
        CONTROL_CLASSES,
        hasError ? 'border-danger' : 'border-line',
        className,
      )}
      {...props}
    />
  );
});

export const FieldTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function FieldTextarea({ className, ...props }, ref) {
  const { hasError } = useField();
  return (
    <textarea
      ref={ref}
      {...useControlProps()}
      className={cn(
        CONTROL_CLASSES,
        'min-h-28 resize-y leading-relaxed',
        hasError ? 'border-danger' : 'border-line',
        className,
      )}
      {...props}
    />
  );
});
