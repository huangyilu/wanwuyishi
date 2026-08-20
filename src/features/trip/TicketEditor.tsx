/**
 * 门票 / 订票 编辑 —— 挂在景点导览卡里（PC 工作台与移动随身册共用同一张卡）。
 *
 * 设计意图（见 ItemEditor 注释「票务在导览卡里管」）：景点的「已订票 / 确认号 /
 * 备注」是结构化信息，走独立的 Ticket 模型，而非塞进 TripItem.note。
 *
 * 这里只负责「创建 / 编辑 / 删除」一条挂在某个行程条目上的门票；保存走
 * useTripMutations.upsertTicket（乐观更新，松手即生效）。
 *
 * 门票保存后可上传 PDF 附件（电子票 / 确认单），走 Supabase Storage，
 * 预览用 PdfViewer 弹窗（桌面 iframe / 移动新标签页）。
 */
import { useState, type ChangeEvent } from 'react';
import type { Ticket, TicketAttachment } from '../../data/types';
import { useTripMutations } from './queries';
import { isCloudStorage } from './uploadAttachment';
import {
  uploadTicketAttachment,
  deleteTicketAttachment,
} from './uploadTicketAttachment';
import { PdfViewer } from '../../components/PdfViewer';
import s from './TicketEditor.module.css';

export function TicketEditor({
  tripId,
  itemId,
  poiName,
  ticket,
}: {
  tripId: string;
  itemId: string;
  poiName?: string;
  ticket?: Ticket | null;
}) {
  const mut = useTripMutations(tripId);
  const [open, setOpen] = useState(Boolean(ticket));
  const [booked, setBooked] = useState(ticket?.booked ?? true);
  const [channel, setChannel] = useState(ticket?.channel ?? '');
  const [bookingRef, setBookingRef] = useState(ticket?.bookingRef ?? '');
  const [note, setNote] = useState(ticket?.note ?? '');
  const [timeSlot, setTimeSlot] = useState(ticket?.timeSlot ?? '');
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<TicketAttachment | null>(null);

  const attachments = ticket?.attachments ?? [];
  const cloud = isCloudStorage();

  async function save() {
    setBusy(true);
    try {
      await mut.upsertTicket.mutateAsync({
        id: ticket?.id,
        tripId,
        itemId,
        title: poiName ?? ticket?.title ?? '',
        channel: channel.trim() || null,
        officialUrl: ticket?.officialUrl ?? null,
        priceCents: ticket?.priceCents ?? null,
        currency: ticket?.currency ?? null,
        timeSlot: timeSlot.trim() || null,
        bookingRef: bookingRef.trim() || null,
        booked,
        leadDays: ticket?.leadDays ?? null,
        note: note.trim() || null,
      });
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!ticket?.id) return;
    setBusy(true);
    try {
      await mut.removeTicket.mutateAsync(ticket.id);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  /** 上传 PDF 附件 */
  async function onPickPdf(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !ticket?.id) return;
    setPdfBusy(true);
    setPdfErr(null);
    try {
      const meta = await uploadTicketAttachment(tripId, ticket.id, file);
      const next = [...attachments, meta];
      await mut.upsertTicket.mutateAsync({
        ...ticket,
        attachments: next,
      });
    } catch (ex) {
      setPdfErr(ex instanceof Error ? ex.message : '上传失败');
    } finally {
      setPdfBusy(false);
    }
  }

  /** 删除单个 PDF 附件 */
  async function onRemovePdf(att: TicketAttachment) {
    setPdfErr(null);
    try {
      await deleteTicketAttachment(att.url);
      const next = attachments.filter((a) => a.url !== att.url);
      await mut.upsertTicket.mutateAsync({
        ...ticket!,
        attachments: next,
      });
    } catch (ex) {
      setPdfErr(ex instanceof Error ? ex.message : '删除失败');
    }
  }

  /** 格式化文件大小 */
  function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (!open) {
    return (
      <button type="button" className={s.addBtn} onClick={() => setOpen(true)}>
        ＋ 记录订票
      </button>
    );
  }

  return (
    <>
    <div className={s.box}>
      <div className={s.title}>🎫 订票信息</div>

      <div className={s.bookedRow}>
        <label className={s.checkLabel}>
          <input type="checkbox" checked={booked} onChange={(e) => setBooked(e.target.checked)} />
          已订票
        </label>
        <input
          type="time"
          className={s.timeInline}
          value={timeSlot}
          onChange={(e) => setTimeSlot(e.target.value)}
          title="入场时间（预订场次）"
        />
      </div>

      <input
        className={s.input}
        placeholder="购票渠道（如官网 / 携程 / Klook）"
        value={channel}
        onChange={(e) => setChannel(e.target.value)}
      />

      <input
        className={s.input}
        placeholder="确认号 / 订单号"
        value={bookingRef}
        onChange={(e) => setBookingRef(e.target.value)}
      />

      <textarea
        className={s.textarea}
        placeholder="备注：票种 / 入场时段 / 注意事项…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <div className={s.actions}>
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={save}>
          {busy ? '保存中…' : '保存'}
        </button>
        {ticket?.id && (
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={remove}>
            删除
          </button>
        )}
      </div>

      {/* PDF 附件区 —— 门票保存后才可用 */}
      {ticket?.id && (
        <div className={s.pdfSection}>
          <div className={s.pdfTitle}>📎 PDF 附件{attachments.length > 0 ? `（${attachments.length}）` : ''}</div>

          {attachments.length > 0 && (
            <div className={s.pdfList}>
              {attachments.map((att) => (
                <div key={att.url} className={s.pdfItem}>
                  <button
                    type="button"
                    className={s.pdfName}
                    onClick={() => setPreview(att)}
                    title="点击预览"
                  >
                    {att.name}
                  </button>
                  <span className={s.pdfSize}>{fmtSize(att.size)}</span>
                  <button
                    type="button"
                    className={s.pdfDel}
                    onClick={() => onRemovePdf(att)}
                    title="删除"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {cloud ? (
            <label className={`${s.pdfUpload} ${pdfBusy ? s.pdfBusy : ''}`}>
              {pdfBusy ? '上传中…' : '+ 上传 PDF'}
              <input
                type="file"
                accept="application/pdf"
                hidden
                onChange={onPickPdf}
                disabled={pdfBusy}
              />
            </label>
          ) : (
            <div className={s.cloudOnly}>登录云端后可上传 PDF 附件</div>
          )}
          {pdfErr && <div className={s.pdfErr}>{pdfErr}</div>}
        </div>
      )}
    </div>
    {preview && (
      <PdfViewer
        url={preview.url}
        name={preview.name}
        onClose={() => setPreview(null)}
      />
    )}
  </>
  );
}
