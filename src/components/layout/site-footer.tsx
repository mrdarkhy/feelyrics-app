import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Logo } from '@/components/brand/logo';

export function SiteFooter() {
  const t = useTranslations('footer');
  const brand = useTranslations('brand');
  const nav = useTranslations('nav');

  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <Logo size={28} />
          <div className="max-w-sm space-y-1.5">
            <p className="font-brand text-[15px] font-bold text-bone">
              {brand('slogan')}
            </p>
            {/* The rights line is not fine print: it is the project's actual
                position on what it publishes, so it sits in plain sight. */}
            <p className="text-[13px] leading-relaxed text-olive">{t('rights')}</p>
          </div>
        </div>

        <nav aria-label={nav('primaryLabel')}>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
            <li>
              <Link href="/" className="text-bone-muted transition-colors hover:text-bone">
                {nav('library')}
              </Link>
            </li>
            <li>
              <Link
                href="/requests"
                className="text-bone-muted transition-colors hover:text-bone"
              >
                {nav('requests')}
              </Link>
            </li>
            <li>
              <Link
                href="/about"
                className="text-bone-muted transition-colors hover:text-bone"
              >
                {nav('about')}
              </Link>
            </li>
          </ul>
          <p className="mt-4 text-[12px] text-olive">{t('builtBy')}</p>
        </nav>
      </div>
    </footer>
  );
}
