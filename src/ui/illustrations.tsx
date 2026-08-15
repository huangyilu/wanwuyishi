/**
 * 空状态手绘感线描插画 —— 探险手帐风。
 * 纯内联 SVG，跟随主题变量走色，零外部依赖、零成本。
 */
import type { CSSProperties } from 'react';

type Props = { kind: 'route' | 'map' | 'compass'; size?: number; style?: CSSProperties; className?: string };

const brand = 'var(--brand)';
const brandSoft = 'var(--brand-soft)';
const line = 'var(--line-strong)';
const gold = 'var(--gold)';

export function EmptyArt({ kind, size = 96, style, className }: Props) {
  if (kind === 'route') return <RouteArt size={size} style={style} className={className} />;
  if (kind === 'map') return <MapArt size={size} style={style} className={className} />;
  return <CompassArt size={size} style={style} className={className} />;
}

function RouteArt({ size, style, className }: { size: number; style?: CSSProperties; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden style={style} className={className}>
      <path d="M14 78 C 30 60, 40 70, 52 50 S 74 30, 84 18" stroke={brand} strokeWidth="2.4" strokeLinecap="round" strokeDasharray="1 7" opacity="0.8" />
      <path d="M14 78 C 30 60, 40 70, 52 50 S 74 30, 84 18" stroke={brand} strokeWidth="2" strokeLinecap="round" opacity="0.25" />
      <circle cx="14" cy="78" r="5" fill={brand} />
      <circle cx="14" cy="78" r="9" stroke={brandSoft} strokeWidth="3" />
      {/* 终点旗标 */}
      <path d="M84 18 l0 -12" stroke={line} strokeWidth="2" strokeLinecap="round" />
      <path d="M84 6 l12 4 l-12 4 Z" fill={gold} />
      {/* 小飞机 */}
      <g transform="translate(52 50) rotate(-32)">
        <path d="M0 -7 L2 -2 L9 1 L2 3 L0 8 L-2 3 L-9 1 L-2 -2 Z" fill={brand} />
      </g>
      <circle cx="52" cy="50" r="2.4" fill="var(--bg)" stroke={brand} strokeWidth="1.4" />
    </svg>
  );
}

function MapArt({ size, style, className }: { size: number; style?: CSSProperties; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden style={style} className={className}>
      <path d="M18 26 L40 20 L58 26 L78 20 L78 70 L58 76 L40 70 L18 76 Z" stroke={line} strokeWidth="2" strokeLinejoin="round" />
      <path d="M40 20 L40 70 M58 26 L58 76" stroke={line} strokeWidth="2" opacity="0.6" />
      <path d="M18 26 L40 32 L58 26 L78 32" stroke={brandSoft} strokeWidth="3" />
      <path d="M18 76 L40 70 L58 76 L78 70" stroke={brandSoft} strokeWidth="3" />
      {/* 定位针 */}
      <path d="M49 40 C 44 40, 41 44, 41 48 C 41 54, 49 62, 49 62 C 49 62, 57 54, 57 48 C 57 44, 54 40, 49 40 Z" fill={brand} />
      <circle cx="49" cy="48" r="3" fill="var(--bg)" />
    </svg>
  );
}

function CompassArt({ size, style, className }: { size: number; style?: CSSProperties; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden style={style} className={className}>
      <circle cx="48" cy="48" r="34" stroke={line} strokeWidth="2" />
      <circle cx="48" cy="48" r="34" stroke={brandSoft} strokeWidth="6" opacity="0.6" />
      <circle cx="48" cy="48" r="26" stroke={line} strokeWidth="1.2" opacity="0.7" />
      <path d="M48 16 L54 48 L48 80 L42 48 Z" fill={brand} />
      <path d="M48 16 L48 80 L42 48 Z" fill={brand} opacity="0.55" />
      <circle cx="48" cy="48" r="3.4" fill="var(--bg)" stroke={brand} strokeWidth="1.6" />
      <path d="M48 8 l0 -3 M48 88 l0 3 M8 48 l-3 0 M88 48 l3 0" stroke={gold} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
