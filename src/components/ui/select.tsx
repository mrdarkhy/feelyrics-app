'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { cn } from '@/lib/cn';

/**
 * Select on Radix.
 *
 * A native `<select>` cannot be styled to match the rest of this interface, and
 * hand-rolling a listbox means reimplementing type-ahead, arrow navigation and
 * the `aria-activedescendant` dance. Radix has both, so the only thing left here
 * is appearance.
 */

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(function SelectTrigger({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex h-10 w-full items-center justify-between gap-2 rounded-xl',
        'border border-line bg-ground-raised px-3 text-[14px] text-bone',
        'transition-colors hover:border-line-strong',
        'data-[placeholder]:text-olive',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <svg
          width="12"
          height="8"
          viewBox="0 0 12 8"
          fill="none"
          aria-hidden="true"
          className="shrink-0 text-olive"
        >
          <path
            d="M1 1.5 6 6.5l5-5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});

export const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position="popper"
        sideOffset={6}
        className={cn(
          'z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden',
          'rounded-xl border border-line bg-elevated shadow-float',
          'data-[state=open]:animate-fade-in',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

export const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-lg',
        'py-2 pl-8 pr-3 text-[14px] text-bone-muted outline-none',
        'data-[highlighted]:bg-ground-raised data-[highlighted]:text-bone',
        'data-[state=checked]:text-amber',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2.5 inline-flex w-3 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <svg width="12" height="10" viewBox="0 0 12 10" fill="none" aria-hidden="true">
            <path
              d="M1 5.2 4.3 8.5 11 1.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});
