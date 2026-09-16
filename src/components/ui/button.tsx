'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/cn';

/**
 * The one button.
 *
 * `asChild` lets a link adopt the button's appearance without becoming a
 * `<button>` — which matters for assistive technology, where "navigates
 * somewhere" and "does something" are different promises.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-amber text-amber-ink font-semibold hover:brightness-110 active:brightness-95',
  secondary:
    'border border-line-strong bg-elevated text-bone hover:border-amber/50 hover:bg-ground-raised',
  ghost:
    'border border-line text-bone-muted hover:text-bone hover:border-line-strong hover:bg-ground-raised',
  quiet: 'text-bone-muted hover:text-bone hover:bg-ground-raised',
  danger:
    'border border-danger/50 bg-danger-soft text-danger hover:bg-danger/15',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
  /** Shows a busy state and blocks repeat submits. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = 'secondary',
      size = 'md',
      asChild = false,
      loading = false,
      disabled,
      children,
      type,
      ...props
    },
    ref,
  ) {
    const Component = asChild ? Slot : 'button';

    return (
      <Component
        ref={ref}
        // A button inside a form defaults to `submit`, which is a classic source
        // of accidental submissions. Anything not explicitly a submit is a button.
        type={asChild ? undefined : (type ?? 'button')}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex select-none items-center justify-center rounded-pill',
          'transition-[background-color,border-color,color,filter] duration-150',
          'disabled:pointer-events-none disabled:opacity-50',
          SIZES[size],
          VARIANTS[variant],
          className,
        )}
        {...props}
      >
        {children}
      </Component>
    );
  },
);
