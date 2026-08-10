/**
 * 图片附件上传 —— 仅云端档（Supabase Storage）可用。
 *
 * 文件本体存在 trip-attachments bucket，对象 key 形如
 *   trip-attachments/{tripId}/{itemId}/{timestamp}-{filename}
 * 这里只负责「上传 / 删除 / 取公开 URL」，URL 写回 TripItem.images。
 *
 * 本地档（localStorage）不走此路：localStorage 上限约 5MB，塞不进图片，
 * 因此上传入口只在 isCloudStorage() 为 true（即已登录云端）时显示。
 */
import { supabase } from '../../data/supabase-client';

const BUCKET = 'trip-attachments';
const MAX_BYTES = 5 * 1024 * 1024;

/** 是否已连上云端（supabase 客户端配置就绪） */
export function isCloudStorage(): boolean {
  return supabase !== null;
}

/** 上传一张图片，返回可直链的公开 URL */
export async function uploadAttachment(tripId: string, itemId: string, file: File): Promise<string> {
  if (!supabase) throw new Error('未连接到云端，无法上传图片');
  if (!file.type.startsWith('image/')) throw new Error('只能上传图片文件');
  if (file.size > MAX_BYTES) throw new Error('图片不能超过 5MB');

  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-60);
  const path = `${tripId}/${itemId}/${Date.now()}-${safe}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** 按已存的公开 URL 删除对象（删除条目图片时调用） */
export async function deleteAttachment(url: string): Promise<void> {
  if (!supabase) return;
  const path = attachmentPathFromUrl(url);
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

/** 从公开 URL 反解出对象路径（用于删除） */
function attachmentPathFromUrl(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i >= 0 ? url.slice(i + marker.length) : null;
}
