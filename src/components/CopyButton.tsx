import { useState, type ReactNode } from 'react';
import s from './CopyButton.module.css';

type Props = {
  text: string;
  /** 默认「复制」，住宿场景传「复制地址」更直观 */
  label?: string;
  copiedLabel?: string;
  /** 嵌套在 <button> 内（如移动端卡片）时用 span，避免非法 HTML */
  asSpan?: boolean;
  className?: string;
  icon?: ReactNode;
};

export function CopyButton({
  text,
  label = '复制',
  copiedLabel = '已复制',
  asSpan = false,
  className,
  icon,
}: Props) {
  const [copied, setCopied] = useState(false);

  async function handle(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时静默失败，不阻断交互 */
    }
  }

  const cls = `${s.btn} ${copied ? s.copied : ''} ${className ?? ''}`;
  const content = (
    <>
      {icon ?? (copied ? '✓' : '⧉')}
      <span>{copied ? copiedLabel : label}</span>
    </>
  );

  if (asSpan) {
    return (
      <span
        className={cls}
        role="button"
        tabIndex={0}
        onClick={handle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handle(e);
          }
        }}
      >
        {content}
      </span>
    );
  }
  return (
    <button type="button" className={cls} onClick={handle} title="复制到剪贴板">
      {content}
    </button>
  );
}
