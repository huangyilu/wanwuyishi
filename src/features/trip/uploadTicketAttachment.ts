/**
 * 门票 PDF 附件上传 —— 仅云端档（Supabase Storage）可用。
 *
 * 文件本体存在 trip-attachments bucket，对象 key 形如
 *   trip-attachments/{tripId}/tickets/{ticketId}/{timestamp}-{filename}
 * 这里负责「上传 / 删除」，上传后返回元数据（url / name / size / uploadedAt），
 * 调用方把元数据追加到 Ticket.attachments 数组。
 *
 * 与 uploadAttachment.ts（图片）并列，职责分离：图片走 TripItem.images，
 * PDF 走 Ticket.attachments。
 */
import { supabase } from '../../data/supabase-client';
import type { TicketAttachment } from '../../data/types';

const BUCKET = 'trip-attachments';
const MAX_BYTES = 10 * 1024 * 1024;

/** 上传一份 PDF，返回元数据对象 */
export async function uploadTicketAttachment(
  tripId: string,
  ticketId: string,
  file: File,
): Promise<TicketAttachment> {
  if (!supabase) throw new Error('未连接到云端，无法上传附件');
  if (file.type !== 'application/pdf') throw new Error('只能上传 PDF 文件');
  if (file.size > MAX_BYTES) throw new Error('PDF 不能超过 10MB');

  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-60);
  const path = `${tripId}/tickets/${ticketId}/${Date.now()}-${safe}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: 'application/octet-stream' });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return {
    url: data.publicUrl,
    name: file.name,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
}

/** 按已存的公开 URL 删除对象（删除门票附件时调用） */
export async function deleteTicketAttachment(url: string): Promise<void> {
  if (!supabase) return;
  const path = attachmentPathFromUrl(url);
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

/** 从公开 URL 反解出对象路径 */
function attachmentPathFromUrl(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i >= 0 ? url.slice(i + marker.length) : null;
}
