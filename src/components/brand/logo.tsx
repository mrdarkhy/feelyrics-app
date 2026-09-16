import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

/**
 * The brand mark.
 *
 * Rendered from the source artwork, never redrawn as inline SVG. A hand-traced
 * approximation of somebody's logo is not their logo — it is a near-miss that
 * looks wrong to the one person who knows it best.
 */
export function Logo({
  size = 34,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/icon-512.png"
      alt=""
      width={size}
      height={size}
      priority
      className={cn('shrink-0 rounded-lg', className)}
      // Decorative: the wordmark beside it already carries the name, so
      // announcing the logo too would just repeat it.
      aria-hidden="true"
    />
  );
}

export function Wordmark({ className }: { className?: string }) {
  const t = useTranslations('brand');
  return (
    <span
      className={cn(
        'font-brand text-[19px] font-bold leading-none tracking-tight text-bone',
        className,
      )}
    >
      {t('name')}
    </span>
  );
}

export function BrandLockup({ className }: { className?: string }) {
  const t = useTranslations('brand');
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Logo size={32} />
      <span className="flex flex-col leading-tight">
        <Wordmark />
        <span className="text-[11px] text-olive">{t('tagline')}</span>
      </span>
    </span>
  );
}
