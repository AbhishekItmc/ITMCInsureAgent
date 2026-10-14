import { CarFront, HeartPulse, Home, Plane } from 'lucide-react';
import { PRODUCT_LABEL } from '../config/rules';
import type { Product } from '../types';
import { cx } from './primitives';

export const PRODUCT_ICON = { motor: CarFront, travel: Plane, medical: HeartPulse, home: Home } as const;

export function ProductPill({ product, className }: { product: Product; className?: string }) {
  const Icon = PRODUCT_ICON[product];
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border border-line bg-sunken px-2 py-0.5 text-[11.5px] font-semibold text-ink whitespace-nowrap', className)}>
      <Icon size={12} className="text-teal" /> {PRODUCT_LABEL[product]}
    </span>
  );
}
