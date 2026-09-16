'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { signInAction } from '@/actions/admin';
import { Button } from '@/components/ui/button';
import { Field, FieldInput, FieldLabel } from '@/components/ui/field';

export function AdminLogin({ configured }: { configured: boolean }) {
  const t = useTranslations('admin');
  const router = useRouter();
  const [token, setToken] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  if (!configured) {
    return (
      <div className="fl-surface mx-auto max-w-md p-6 text-center">
        <p className="text-[15px] text-bone-muted">{t('notConfigured')}</p>
      </div>
    );
  }

  return (
    <form
      className="fl-surface mx-auto max-w-md space-y-5 p-6"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await signInAction(token);
          if (!result.ok) {
            setError(t('invalidToken'));
            return;
          }
          setToken('');
          router.refresh();
        });
      }}
    >
      <div className="space-y-1.5">
        <h1 className="font-display text-xl font-extrabold text-bone">
          {t('loginTitle')}
        </h1>
        <p className="text-[14px] text-bone-muted">{t('loginBody')}</p>
      </div>

      <Field error={error}>
        <FieldLabel>{t('tokenLabel')}</FieldLabel>
        <FieldInput
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="current-password"
          required
        />
      </Field>

      <Button type="submit" variant="primary" loading={pending} className="w-full">
        {t('signIn')}
      </Button>
    </form>
  );
}
