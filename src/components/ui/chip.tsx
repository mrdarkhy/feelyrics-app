'use client';

import * as React from 'react';
import * as TogglePrimitive from '@radix-ui/react-toggle-group';
import { cn } from '@/lib/cn';

/**
 * Chips.
 *
 * `Chip` is a label — static, never focusable, never announced as interactive.
 * `ChipGroup` is a real control built on Radix's toggle group, so a set of
 * filters or reason tags behaves like one widget: arrow keys move between
 * options, the pressed state is exposed, and the group carries a name.
 *
 * Keeping the two apart matters. A decorative chip that looks clickable and is
 * not is a small lie the interface tells, and screen-reader users are the ones
 * who find out.
 */

type Tone = 'neutral' | 'amber' | 'feel' | 'muted';

const TONES: Record<Tone, string> = {
  neutral: 'border-line-strong text-bone-muted',
  amber: 'border-amber/45 bg-amber-soft text-amber',
  feel: 'border-feel/45 bg-feel-soft text-feel',
  muted: 'border-line border-dashed text-olive',
};

export function Chip({
  children,
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'fl-chip inline-flex items-center gap-1 rounded-pill border px-2.5 py-0.5',
        'text-[11px] font-semibold tracking-wide',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export interface ChipOption {
  value: string;
  label: string;
  /** Read by assistive tech when the label alone is too terse. */
  description?: string;
}

export interface ChipGroupProps {
  label: string;
  options: readonly ChipOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  type?: 'multiple';
  className?: string;
}

/** Multi-select chips — reason tags, target languages. */
export function ChipGroup({
  label,
  options,
  value,
  onValueChange,
  className,
}: ChipGroupProps) {
  return (
    <TogglePrimitive.Root
      type="multiple"
      value={value}
      onValueChange={onValueChange}
      aria-label={label}
      className={cn('flex flex-wrap gap-2', className)}
      /**
       * `role="group"` rather than the `toolbar` Radix would apply on its own.
       * A toolbar promises a set of command buttons; this is "pick as many as
       * apply", and each chip already announces its state through
       * `aria-pressed`. Describing it as a toolbar would set the wrong
       * expectation for exactly the users who rely on the description.
       */
      role="group"
      /**
       * Roving focus is off for the same reason: with it, the whole set is one
       * tab stop and arrow keys move within — a convention worth teaching for
       * fifty items, not for four. Here every chip is directly reachable with
       * Tab, which needs no explanation at all.
       */
      rovingFocus={false}
    >
      {options.map((option) => (
        <TogglePrimitive.Item
          key={option.value}
          value={option.value}
          title={option.description}
          className={cn(
            'rounded-pill border border-line px-3 py-1.5 text-[13px] font-semibold',
            'text-bone-muted transition-colors',
            'hover:border-line-strong hover:text-bone',
            'data-[state=on]:border-amber/55 data-[state=on]:bg-amber-soft data-[state=on]:text-amber',
          )}
        >
          {option.label}
        </TogglePrimitive.Item>
      ))}
    </TogglePrimitive.Root>
  );
}

export interface SingleChipGroupProps {
  label: string;
  options: readonly ChipOption[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

/** Single-select chips — the "Into" language filter. */
export function SingleChipGroup({
  label,
  options,
  value,
  onValueChange,
  className,
}: SingleChipGroupProps) {
  return (
    <TogglePrimitive.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        // Radix clears the value when the active item is pressed again. A filter
        // with nothing selected has no meaning here, so the choice stands.
        if (next) onValueChange(next);
      }}
      aria-label={label}
      className={cn('flex flex-wrap gap-2', className)}
      orientation="horizontal"
      rovingFocus
    >
      {options.map((option) => (
        <TogglePrimitive.Item
          key={option.value}
          value={option.value}
          className={cn(
            'rounded-pill border border-line px-3 py-1 text-[13px] font-semibold',
            'text-bone-muted transition-colors',
            'hover:border-line-strong hover:text-bone',
            'data-[state=on]:border-amber/55 data-[state=on]:bg-amber-soft data-[state=on]:text-amber',
          )}
        >
          {option.label}
        </TogglePrimitive.Item>
      ))}
    </TogglePrimitive.Root>
  );
}
