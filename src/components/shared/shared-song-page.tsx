'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { decodeSharePackage } from '@/lib/share-link';
import { toSharedSongView } from '@/lib/view-models';
import type { SharedSongView } from '@/lib/view-models';
import { useHash } from '@/lib/use-hash';
import { SongReader } from '@/components/song/song-reader';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldTextarea } from '@/components/ui/field';

/**
 * The page a share link opens.
 *
 * Necessarily a client component: the payload lives in the URL fragment, and the
 * server never receives it — that is the entire design. The decoding therefore
 * happens in the browser, derived straight from the hash rather than copied into
 * state, so there is no moment where the two disagree.
 *
 * A paste box is the fallback, because messaging apps have a habit of shortening
 * long links and dropping everything after the `#`.
 */
export function SharedSongPage() {
  const t = useTranslations('shared');
  const tShare = useTranslations('share');

  const hash = useHash();
  const [pasted, setPasted] = React.useState('');
  const [submittedPaste, setSubmittedPaste] = React.useState('');

  // A pasted payload takes precedence: somebody using the box is telling us the
  // address bar did not survive the trip.
  const source = submittedPaste || hash;

  const decoded = React.useMemo(() => {
    if (source.length === 0) return null;
    const result = decodeSharePackage(source);
    return result.ok ? toSharedSongView(result.value) : 'invalid';
  }, [source]);

  if (decoded && decoded !== 'invalid') {
    return <LoadedSong song={decoded} notice={t('openedNotice')} payload={source} />;
  }

  const invalid = decoded === 'invalid';

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-2xl font-extrabold text-bone">
          {invalid ? t('invalidTitle') : t('emptyTitle')}
        </h1>
        <p className="text-[15px] leading-relaxed text-bone-muted">
          {invalid ? t('invalidBody') : t('emptyBody')}
        </p>
      </header>

      <form
        className="fl-surface space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmittedPaste(pasted.trim());
        }}
      >
        <Field error={invalid && submittedPaste ? tShare('pasteInvalid') : null}>
          <FieldLabel>{tShare('pasteLabel')}</FieldLabel>
          <FieldTextarea
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder={tShare('pastePlaceholder')}
            rows={5}
            className="font-mono text-[12px]"
          />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="primary">
            {tShare('pasteSubmit')}
          </Button>
        </div>
      </form>
    </div>
  );
}

function LoadedSong({
  song,
  notice,
  payload,
}: {
  song: SharedSongView;
  notice: string;
  payload: string;
}) {
  const t = useTranslations('song');
  // The link this page was opened from is itself the share link — rebuilt here
  // so the reader can pass the song on, with any sync they added folded in.
  const [origin, setOrigin] = React.useState<string | null>(null);
  React.useEffect(() => {
    // Read once after mount: the origin is browser state, unknown on the server.
    const id = window.setTimeout(() => setOrigin(window.location.origin + window.location.pathname), 0);
    return () => window.clearTimeout(id);
  }, []);
  const fragment = payload.replace(/^.*#/, '');
  const shareUrl = origin ? `${origin}#${fragment}` : undefined;

  return (
    <div className="space-y-6">
      <p className="rounded-card border border-line bg-panel px-4 py-3 text-[13px] text-bone-muted">
        {notice}
      </p>
      <SongReader song={song} shareUrl={shareUrl} shareLabel={t('shareButtonShared')} />
    </div>
  );
}
