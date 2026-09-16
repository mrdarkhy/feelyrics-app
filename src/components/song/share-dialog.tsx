'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/**
 * Share sheet.
 *
 * The link's payload sits after the `#`, which browsers never transmit — so the
 * song travels from this device to the reader's without passing through any
 * server of ours. That is the sentence in the body copy, and it is worth saying
 * plainly rather than hiding behind "secure sharing": it is the reason a full
 * translation can be shared at all while the public pages stay at two lines.
 */
export function ShareDialog({
  url,
  open,
  onOpenChange,
}: {
  url: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('share');
  const { notify } = useToast();
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  async function copy() {
    const field = inputRef.current;
    if (field) {
      field.select();
      field.setSelectionRange(0, field.value.length);
    }

    try {
      await navigator.clipboard.writeText(url);
      notify(t('copied'), 'success');
    } catch {
      // The Clipboard API needs a secure context and permission; when either is
      // missing the text is already selected, so copying by hand still works.
      notify(t('copyFailed'), 'danger');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('title')} description={t('body')}>
        <div className="flex flex-col gap-2">
          <label htmlFor="share-url" className="sr-only">
            {t('linkLabel')}
          </label>
          <textarea
            id="share-url"
            ref={inputRef}
            readOnly
            value={url}
            rows={4}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full resize-none break-all rounded-xl border border-line bg-ground-raised p-3 font-mono text-[11px] leading-relaxed text-bone-muted"
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
          <Button variant="primary" onClick={copy}>
            {t('copy')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
