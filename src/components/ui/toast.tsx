'use client';

import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

/**
 * Toasts.
 *
 * Used only for outcomes a person needs to know about and can do nothing with —
 * "copied", "suggestion sent". Anything they must act on belongs in the page,
 * not in a message that leaves on a timer.
 *
 * Radix puts the region in an ARIA live area and makes toasts reachable with F6,
 * so a keyboard user can get to an action inside one.
 */

type ToastTone = 'neutral' | 'success' | 'danger';

interface ToastMessage {
  id: number;
  title: string;
  tone: ToastTone;
}

interface ToastContextValue {
  notify: (title: string, tone?: ToastTone) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside <ToastProvider>.');
  }
  return context;
}

const TONES: Record<ToastTone, string> = {
  neutral: 'border-line-strong',
  success: 'border-feel/50',
  danger: 'border-danger/50',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common');
  const [messages, setMessages] = React.useState<ToastMessage[]>([]);
  const nextId = React.useRef(0);

  const notify = React.useCallback((title: string, tone: ToastTone = 'neutral') => {
    nextId.current += 1;
    const id = nextId.current;
    setMessages((current) => [...current, { id, title, tone }]);
  }, []);

  const value = React.useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
        {children}

        {messages.map((message) => (
          <ToastPrimitive.Root
            key={message.id}
            onOpenChange={(open) => {
              if (!open) {
                setMessages((current) => current.filter((m) => m.id !== message.id));
              }
            }}
            className={cn(
              'flex items-start gap-3 rounded-xl border bg-elevated p-3.5 shadow-float',
              'data-[state=open]:animate-slide-up',
              TONES[message.tone],
            )}
          >
            <ToastPrimitive.Title className="flex-1 text-[14px] leading-snug text-bone">
              {message.title}
            </ToastPrimitive.Title>
            <ToastPrimitive.Close
              aria-label={t('dismiss')}
              className="rounded p-0.5 text-olive transition-colors hover:text-bone"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  d="M1 1l10 10M11 1L1 11"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}

        <ToastPrimitive.Viewport
          label={t('notifications')}
          className={cn(
            'fixed bottom-0 right-0 z-[60] flex w-full max-w-sm flex-col gap-2 p-4',
            'pb-[max(1rem,env(safe-area-inset-bottom))]',
            'outline-none',
          )}
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
