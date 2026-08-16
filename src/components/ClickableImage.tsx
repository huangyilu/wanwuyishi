import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './ClickableImage.module.css';

export interface LightboxImage {
  src: string;
  caption?: string;
  credit?: string;
  license?: string;
  page?: string;
}

/** 自包含可点击放大图片：点击缩略图 → portal 全屏预览（支持多图画廊） */
export function ClickableImage({
  src,
  alt,
  className,
  caption,
  credit,
  license,
  page,
  gallery,
}: {
  src: string;
  alt: string;
  className?: string;
  caption?: string;
  credit?: string;
  license?: string;
  page?: string;
  /** 多图画廊；点击当前图后可在其中左右切换 */
  gallery?: { src: string; caption?: string }[];
}) {
  const [open, setOpen] = useState(false);
  const items: LightboxImage[] = (gallery ?? [{ src, caption }]).map((g) => ({
    src: g.src,
    caption: g.caption,
    ...(g.src === src ? { credit, license, page } : {}),
  }));
  const start = gallery ? Math.max(0, gallery.findIndex((g) => g.src === src)) : 0;

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={className}
        loading="lazy"
        style={{ cursor: 'zoom-in' }}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      />
      {open && <Lightbox images={items} start={start} onClose={() => setOpen(false)} />}
    </>
  );
}

/** 受控全屏预览层（也可被外部 state 直接调用） */
export function Lightbox({
  images,
  start = 0,
  onClose,
}: {
  images: LightboxImage[];
  start?: number;
  onClose: () => void;
}) {
  const [i, setI] = useState(start);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setI((p) => Math.max(0, p - 1));
      if (e.key === 'ArrowRight') setI((p) => Math.min(images.length - 1, p + 1));
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [images.length, onClose]);

  const cur = images[i];
  if (!cur) return null;

  const panel: ReactNode = (
    <div className={s.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <button className={s.close} onClick={onClose} aria-label="关闭预览">
        ×
      </button>
      {images.length > 1 && i > 0 && (
        <button
          className={`${s.nav} ${s.navPrev}`}
          onClick={(e) => {
            e.stopPropagation();
            setI((p) => p - 1);
          }}
          aria-label="上一张"
        >
          ‹
        </button>
      )}
      {images.length > 1 && i < images.length - 1 && (
        <button
          className={`${s.nav} ${s.navNext}`}
          onClick={(e) => {
            e.stopPropagation();
            setI((p) => p + 1);
          }}
          aria-label="下一张"
        >
          ›
        </button>
      )}

      <figure className={s.figure} onClick={(e) => e.stopPropagation()}>
        <img className={s.big} src={cur.src} alt={cur.caption ?? ''} />
        {(cur.caption || cur.credit) && (
          <figcaption className={s.foot}>
            {cur.caption && <span className={s.cap}>{cur.caption}</span>}
            {cur.credit && (
              <span className={s.credit}>
                © {cur.credit}
                {cur.license ? ` · ${cur.license}` : ''}
                {cur.page && (
                  <a href={cur.page} target="_blank" rel="noreferrer">
                    {' '}
                    来源 ↗
                  </a>
                )}
              </span>
            )}
          </figcaption>
        )}
      </figure>

      {images.length > 1 && <div className={s.counter}>{i + 1} / {images.length}</div>}
    </div>
  );

  return createPortal(panel, document.body);
}
