import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const t = useTranslations('errors');

  return (
    <div className="mx-auto max-w-md space-y-5 py-16 text-center">
      <h1 className="font-display text-3xl font-extrabold text-bone">
        {t('notFoundTitle')}
      </h1>
      <p className="text-[15px] leading-relaxed text-bone-muted">
        {t('notFoundBody')}
      </p>
      <Button asChild variant="primary">
        <Link href="/">{t('backHome')}</Link>
      </Button>
    </div>
  );
}
