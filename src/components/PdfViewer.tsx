/**
 * PDF 预览弹窗 —— iframe 内嵌渲染。
 *
 * 因为上传时 contentType 为 application/octet-stream（绕过 bucket MIME 限制），
 * 直接给 iframe 原始 URL 无法渲染。这里通过 Supabase 客户端下载为 blob，再用
 * URL.createObjectURL + type:'application/pdf' 创建本地 blob URL，
 * 浏览器就能正确识别并渲染 PDF。
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../data/supabase-client';
import s from './PdfViewer.module.css';

/** 从 Supabase Storage 公开 URL 中提取 bucket 和 path */
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const u = new URL(url);
    // URL 格式: https://xxx.supabase.co/storage/v1/object/public/{bucket}/{path}
    const match = u.pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
    if (!match || !match[1] || !match[2]) return null;
    return { bucket: match[1], path: match[2] };
  } catch {
    return null;
  }
}

export function PdfViewer({
  url,
  name,
  onClose,
}: {
  url: string;
  name: string;
  onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // 通过 Supabase 客户端下载 PDF 为 blob，用正确 MIME 类型创建本地 URL
  useEffect(() => {
    let revoked = false;
    const parsed = parseStorageUrl(url);

    const loadPdf = async () => {
      let blob: Blob;
      if (parsed && supabase) {
        const { data, error } = await supabase.storage
          .from(parsed.bucket)
          .download(parsed.path);
        if (error || !data) throw error ?? new Error('download failed');
        blob = data;
      } else {
        const res = await fetch(url);
        blob = await res.blob();
      }
      if (revoked) return;
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      setBlobUrl(URL.createObjectURL(pdfBlob));
    };

    loadPdf().catch(() => setError(true));

    return () => {
      revoked = true;
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [url, onClose]);

  const panel = (
    <div className={s.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={s.container} onClick={(e) => e.stopPropagation()}>
        <div className={s.header}>
          <span className={s.fileName}>{name}</span>
          <div className={s.headerActions}>
            <a
              className={s.openTab}
              href={url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              新标签页打开 ↗
            </a>
            <button className={s.close} onClick={onClose} aria-label="关闭预览">
              ×
            </button>
          </div>
        </div>
        {error ? (
          <div className={s.loading}>加载失败</div>
        ) : blobUrl ? (
          <iframe
            className={s.iframe}
            src={blobUrl}
            title={name}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className={s.loading}>加载中…</div>
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
