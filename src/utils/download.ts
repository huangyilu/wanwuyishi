/**
 * 浏览器端把一段文本下载成文件（不引入第三方库）。
 * 用 Blob + 临时 <a download> 触发，用完即焚。
 */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/markdown;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 把任意标题压成安全的文件名（保留中英文、数字、短横线，其余换成下划线） */
export function safeFileName(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[\s/\\:*?"<>|]+/g, '_')
    .replace(/[^\w一-龥-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return cleaned || 'trip';
}
