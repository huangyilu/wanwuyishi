/**
 * 门票 / 订票 编辑 —— 挂在景点导览卡里（PC 工作台与移动随身册共用同一张卡）。
 *
 * 设计意图（见 ItemEditor 注释「票务在导览卡里管」）：景点的「已订票 / 确认号 /
 * 备注」是结构化信息，走独立的 Ticket 模型，而非塞进 TripItem.note。
 *
 * 这里只负责「创建 / 编辑 / 删除」一条挂在某个行程条目上的门票；保存走
 * useTripMutations.upsertTicket（乐观更新，松手即生效）。
 */
import { useState } from 'react';
import type { Ticket } from '../../data/types';
import { useTripMutations } from './queries';
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

  if (!open) {
    return (
      <button type="button" className={s.addBtn} onClick={() => setOpen(true)}>
        ＋ 记录订票
      </button>
    );
  }

  return (
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
    </div>
  );
}
