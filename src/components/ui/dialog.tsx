'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/cn';

/**
 * Modal dialog on Radix.
 *
 * Radix handles the parts that are easy to get wrong by hand: focus is trapped
 * while open and returned to the trigger on close, the rest of the page is
 * hidden from screen readers, Escape closes, and the scroll behind is locked.
 *
 * On small screens it presents as a bottom sheet, because that is where thumbs
 * are; on larger ones as a centred panel.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]',
        'data-[state=open]:animate-fade-in',
        className,
      )}
      {...props}
    />
  );
});

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Required: every dialog announces itself. */
  title: string;
  description?: string;
}

export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(function DialogContent(
  { className, children, title, description, ...props },
  ref,
) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed z-50 flex flex-col gap-4 border border-line bg-elevated p-5 shadow-sheet',
          'focus:outline-none data-[state=open]:animate-slide-up',
          // Phone: bottom sheet.
          'inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl',
          // Tablet and up: centred panel.
          'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(36rem,calc(100vw-2rem))]',
          'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
          'pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5',
          className,
        )}
        {...props}
      >
        <div className="space-y-1">
          <DialogPrimitive.Title className="font-display text-lg font-extrabold text-bone">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-sm text-bone-muted">
              {description}
            </DialogPrimitive.Description>
          ) : (
            // Radix warns when a dialog has no description; an explicitly empty
            // one is the documented way to say "there is nothing more to add".
            <DialogPrimitive.Description className="sr-only">
              {title}
            </DialogPrimitive.Description>
          )}
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
