/**
 * 账本面板。
 *
 * 信任层旗舰功能：金额全程整数分运算（见 domain/expense/settle），
 * 这里只负责采集与展示——记一笔、选付款人、选参与人（均摊或加权），
 * 实时用 settle() 算出每人净额与"最少转账"方案。
 *
 * 宽屏两栏（左：记一笔 + 明细；右：算账结果，吸顶）；窄屏单列。PC 与移动端共用同一组件。
 */
import { useMemo, useRef, useState } from 'react';
import { useTripBundle, useTripMutations } from '../../features/trip/queries';
import { formatMoney, settle, type ExpenseInput } from '../../domain/expense/settle';
import type { Expense, ExpenseCategory, ExpenseSplitMode, TripMember } from '../../data/types';
import s from './LedgerPanel.module.css';
import panel from '../../ui/panel.module.css';
import { useToast } from '../../ui/toast';

const CATEGORIES: Array<{ code: ExpenseCategory; label: string }> = [
  { code: 'ticket', label: '门票' },
  { code: 'transport', label: '交通' },
  { code: 'food', label: '餐饮' },
  { code: 'stay', label: '住宿' },
  { code: 'shopping', label: '购物' },
  { code: 'other', label: '其他' },
];

const CURRENCIES = ['CNY', 'EUR', 'CHF', 'USD'] as const;
/** 参考汇率：1 单位外币 = ? 人民币（仅参考，输入框可改） */
const REF_FX: Record<string, number> = { CNY: 1, EUR: 7.8, CHF: 8.1, USD: 7.2 };

const FALLBACK_COLOR = '#9aa3af';

export function LedgerPanel({ tripId }: { tripId: string }) {
  const { data: bundle } = useTripBundle(tripId);
  const mut = useTripMutations(tripId);
  const toast = useToast();

  const baseCurrency = bundle?.trip.baseCurrency ?? 'CNY';
  const members: TripMember[] = bundle?.members ?? [];
  const expenses = bundle?.expenses ?? [];

  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName ?? '未知';
  const colorOf = (id: string) => members.find((m) => m.id === id)?.color ?? FALLBACK_COLOR;

  /* ---- 记一笔表单状态 ---- */
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('ticket');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<string>(baseCurrency);
  const [fxRate, setFxRate] = useState<string>(String(REF_FX[baseCurrency] ?? 1));
  const [payerId, setPayerId] = useState<string>(members[0]?.id ?? '');
  const [splitMode, setSplitMode] = useState<ExpenseSplitMode>('aa');
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [customWeight, setCustomWeight] = useState(false);
  const [weights, setWeights] = useState<Record<string, number>>({});

  const isChecked = (id: string) => selected[id] !== false;
  const weightOf = (id: string) => weights[id] ?? 1;

  function setCurrencySafe(code: string) {
    setCurrency(code);
    setFxRate(String(REF_FX[code] ?? 1));
  }

  function toggleMember(id: string) {
    setSelected((prev) => ({ ...prev, [id]: selected[id] === false ? true : false }));
  }

  /* ---- 结算：把每笔按汇率折算到基准币种后交给 domain ---- */
  const settlement = useMemo(() => {
    const inputs: ExpenseInput[] = expenses.map((e) => ({
      id: e.id,
      amountCents: Math.round(e.amountCents * e.fxRate),
      payerMemberId: e.payerMemberId,
      splitMode: e.splitMode,
      shares: e.shares,
    }));
    return settle(inputs);
  }, [expenses]);

  function submit() {
    const amtCents = Math.round((parseFloat(amount) || 0) * 100);
    if (!title.trim()) {
      toast('请填写项目名称', 'warn');
      return;
    }
    if (amtCents <= 0) {
      toast('金额必须大于 0', 'warn');
      return;
    }
    if (!payerId) {
      toast('请选择付款人', 'warn');
      return;
    }

    const shareList = members
      .filter((m) => isChecked(m.id))
      .map((m) => ({ memberId: m.id, weight: customWeight ? Math.max(1, Math.round(weightOf(m.id))) : 1 }));
    // 个人自付：不产生任何分摊份额，结算时整笔跳过
    const finalShares =
      splitMode === 'personal'
        ? []
        : shareList.length > 0
          ? shareList
          : members.map((m) => ({ memberId: m.id, weight: 1 }));

    // 编辑模式：带上原 id（仓库层按 id 更新）+ 保留原始 spentAt
    const editing = editingId ? expenses.find((e) => e.id === editingId) : undefined;
    const isEdit = Boolean(editing);

    mut.upsertExpense.mutate(
      {
        ...(editing ? { id: editing.id } : {}),
        tripId,
        dayId: null,
        itemId: null,
        category,
        title: title.trim(),
        amountCents: amtCents,
        currency,
        fxRate: parseFloat(fxRate) || 1,
        payerMemberId: payerId,
        spentAt: editing ? editing.spentAt : new Date().toISOString().slice(0, 10),
        note: null,
        splitMode,
        shares: finalShares,
      },
      {
        onSuccess: () => {
          toast(isEdit ? '已保存修改' : '已记一笔', 'success');
          setTitle('');
          setAmount('');
          setSplitMode('aa');
          setEditingId(null);
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          toast((isEdit ? '保存失败：' : '记账失败：') + msg, 'error');
        },
      },
    );
  }

  /** 把某笔载入表单进入编辑态 */
  function edit(exp: Expense) {
    setEditingId(exp.id);
    setTitle(exp.title);
    setCategory(exp.category);
    setAmount(String(exp.amountCents / 100));
    setCurrency(exp.currency);
    setFxRate(String(exp.fxRate));
    setPayerId(exp.payerMemberId);
    setSplitMode(exp.splitMode);

    const shareIds = new Set(exp.shares.map((s) => s.memberId));
    const sel: Record<string, boolean> = {};
    const w: Record<string, number> = {};
    let anyWeight = false;
    for (const m of members) {
      const on = shareIds.has(m.id);
      sel[m.id] = on;
      if (on) {
        const wt = exp.shares.find((s) => s.memberId === m.id)?.weight ?? 1;
        if (wt > 1) anyWeight = true;
        w[m.id] = wt;
      }
    }
    setSelected(sel);
    setCustomWeight(anyWeight);
    setWeights(w);
    // 表单在上方、列表在下方，编辑时把表单滚入可视区
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function cancelEdit() {
    setEditingId(null);
    setTitle('');
    setAmount('');
    setSplitMode('aa');
  }

  function del(id: string) {
    if (editingId === id) cancelEdit();
    mut.removeExpense.mutate(id, {
      onSuccess: () => toast('已删除', 'success'),
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        toast(`删除失败：${msg}`, 'error');
      },
    });
  }

  const totalBase = settlement.totalCents;
  const hasDebt = settlement.transfers.length > 0;

  return (
    <div className={panel.page}>
      <div className={panel.card}>
        <div className={panel.head}>
          <div>
            <div className={panel.title}>账本</div>
            <div className={panel.sub}>整数分记账 · 共同支出自动算清谁该给谁，个人花费单独记录</div>
          </div>
          <div className={s.headSummary}>
            <div className={s.hsMain}>
              <span className={s.hsK}>总支出</span>
              <span className={s.hsV}>{formatMoney(totalBase, baseCurrency)}</span>
            </div>
            <div className={s.hsSub}>
              <span>{expenses.length} 笔</span>
              <span className={s.hsSep} />
              <span>{members.length} 人</span>
            </div>
          </div>
        </div>

        <div className={panel.body}>
        <div className={s.grid}>
          {/* 记一笔（常驻侧栏） */}
          <section className={`${s.colForm} ${s.section}`} ref={formRef}>
              <div className={panel.sectionHead}>{editingId ? '编辑账单' : '记一笔'}</div>
              <div className={s.form}>
                <div className={s.formRow3}>
                  <div>
                    <label className={s.label}>项目</label>
                    <input
                      className="field"
                      value={title}
                      placeholder="如：卢浮宫门票"
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={s.label}>类别</label>
                    <select className="field" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                      {CATEGORIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={s.label}>金额</label>
                    <input
                      className="field"
                      inputMode="decimal"
                      value={amount}
                      placeholder="0.00"
                      onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                    />
                  </div>
                </div>

                <div className={s.formRow}>
                  <div className={s.splitToggleWrap}>
                    <label className={s.label}>归属</label>
                    <div className={s.seg}>
                      <button
                        type="button"
                        className={`${s.segBtn} ${splitMode === 'aa' ? s.segOn : ''}`}
                        onClick={() => setSplitMode('aa')}
                      >
                        需要 AA
                      </button>
                      <button
                        type="button"
                        className={`${s.segBtn} ${splitMode === 'personal' ? s.segOn : ''}`}
                        onClick={() => setSplitMode('personal')}
                      >
                        个人
                      </button>
                    </div>
                    <span className={s.segHint}>
                      {splitMode === 'personal' ? '这笔由付款人自己承担，不计入共同分摊' : '这笔由下方参与人共同分摊'}
                    </span>
                  </div>
                </div>

                <div className={s.formRow}>
                  <div>
                    <label className={s.label}>币种</label>
                    <select className="field" value={currency} onChange={(e) => setCurrencySafe(e.target.value)}>
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={s.label}>汇率（{currency} → {baseCurrency}）</label>
                    <input
                      className="field"
                      inputMode="decimal"
                      value={fxRate}
                      onChange={(e) => setFxRate(e.target.value.replace(/[^\d.]/g, ''))}
                    />
                    <div className={s.hint}>汇率仅为参考，以实际为准；金额按整数分四舍五入。</div>
                  </div>
                </div>

                <div>
                  <label className={s.label}>付款人</label>
                  <div className={s.members}>
                    {members.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`${s.memberChip} ${payerId === m.id ? s.memberChipOn : ''}`}
                        onClick={() => setPayerId(m.id)}
                      >
                        <span className={s.dot} style={{ background: m.color ?? FALLBACK_COLOR }} />
                        {m.displayName}
                      </button>
                    ))}
                  </div>
                </div>

                {splitMode === 'aa' && (
                  <div>
                    <label className={s.label}>参与分摊（默认全员均摊）</label>
                    <div className={s.members}>
                      {members.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={`${s.memberChip} ${isChecked(m.id) ? s.memberChipOn : ''}`}
                          onClick={() => toggleMember(m.id)}
                        >
                          <span className={s.dot} style={{ background: m.color ?? FALLBACK_COLOR }} />
                          {m.displayName}
                          {customWeight && isChecked(m.id) && (
                            <input
                              className={s.weightInput}
                              inputMode="numeric"
                              value={weightOf(m.id)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setWeights((prev) => ({ ...prev, [m.id]: Math.max(1, parseInt(e.target.value || '1', 10)) }))}
                            />
                          )}
                        </button>
                      ))}
                    </div>
                    <label style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--text-2)' }}>
                      <input type="checkbox" checked={customWeight} onChange={(e) => setCustomWeight(e.target.checked)} />
                      按权重分摊（勾选后可在成员上填整数权重）
                    </label>
                  </div>
                )}

                <div className={s.formActions}>
                  <button className="btn btn-primary" onClick={submit}>
                    {editingId ? '保存修改' : '记一笔'}
                  </button>
                  {editingId && (
                    <button className="btn btn-ghost" onClick={cancelEdit}>
                      取消
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* 明细 */}
            <section className={`${s.colList} ${s.section}`}>
              <div className={panel.sectionHead}>账单明细</div>
              {expenses.length === 0 ? (
                <div className={panel.empty}>暂无记录。</div>
              ) : (
                <div className={s.list}>
                  {expenses.map((e) => {
                    const base = Math.round(e.amountCents * e.fxRate);
                    const shareNames = e.shares.map((sh) => nameOf(sh.memberId)).join('、');
                    const isPersonal = e.splitMode === 'personal';
                    return (
                      <div key={e.id} className={s.expRow}>
                        <div className={s.expMain}>
                        <div className={s.expTitle}>
                          {e.title}
                          <span className={s.tag}>{CATEGORIES.find((c) => c.code === e.category)?.label ?? e.category}</span>
                            <span className={`${s.splitTag} ${isPersonal ? s.splitTagPersonal : s.splitTagAA}`}>
                              {isPersonal ? '个人' : 'AA'}
                            </span>
                          </div>
                        <div className={s.expMeta}>
                          {isPersonal
                            ? `${nameOf(e.payerMemberId)} 自付`
                            : `${nameOf(e.payerMemberId)} 支付 · 分摊：${shareNames}`}
                        </div>
                        </div>
                        <div className={s.expAmt}>
                          <div className={s.base}>{formatMoney(base, baseCurrency)}</div>
                          <div className={s.orig}>
                            {e.currency === baseCurrency ? '' : `${formatMoney(e.amountCents, e.currency)} · `}
                            {`汇率 ${e.fxRate}`}
                          </div>
                        </div>
                        <div className={s.expActions}>
                          <button className="btn btn-sm btn-ghost" onClick={() => edit(e)}>
                            编辑
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={() => del(e.id)}>
                            删除
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 结算（吸顶侧栏） */}
            <aside className={s.colSettle}>
              <section className={s.section}>
              <div className={panel.sectionHead}>算账结果</div>
              <div className={s.settleNote}>仅结算「需要 AA」的共同支出；「个人」花费不计入，只在明细中记录。</div>
              {expenses.length === 0 ? (
                <div className={panel.empty}>还没有账单。记一笔之后这里会自动算出谁欠谁。</div>
              ) : hasDebt ? (
                <div className={s.settle}>
                  {settlement.transfers.map((t, i) => (
                    <div key={i} className={s.transferCard}>
                      <span className={s.transferFrom}>
                        <span className={s.dot} style={{ background: colorOf(t.fromMemberId) }} />
                        {nameOf(t.fromMemberId)}
                      </span>
                      <span className={s.transferArrow}>→</span>
                      <span className={s.transferTo}>
                        <span className={s.dot} style={{ background: colorOf(t.toMemberId) }} />
                        {nameOf(t.toMemberId)}
                      </span>
                      <span className={s.transferAmt}>{formatMoney(t.amountCents, baseCurrency)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={s.noDebt}>账目已平，谁也不欠谁。</div>
              )}

              {expenses.length > 0 && (
                <div className={s.balances} style={{ marginTop: 14 }}>
                  {members.map((m) => {
                    const net = settlement.balances[m.id] ?? 0;
                    if (net === 0) return null;
                    return (
                      <div key={m.id} className={s.balanceCard}>
                        <div className={s.balanceName}>
                          <span className={s.dot} style={{ background: m.color ?? FALLBACK_COLOR }} />
                          {m.displayName}
                        </div>
                        <div className={`${s.balanceVal} ${net > 0 ? s.creditor : s.debtor}`}>
                          {net > 0 ? '应收 ' : '应付 '}
                          {formatMoney(Math.abs(net), baseCurrency)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </aside>
        </div>
        </div>
      </div>
    </div>
  );
}
