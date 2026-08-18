import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTripRepo } from '../../data';
import type {
  AddItemInput,
  CreateTripInput,
  Expense,
  PackingItem,
  Ticket,
  Trip,
  TripBundle,
  TripDay,
  TripItem,
} from '../../data/types';

const bundleKey = (tripId: string) => ['trip', 'bundle', tripId] as const;

export function useTrips() {
  const repo = useTripRepo();
  return useQuery({ queryKey: ['trip', 'list'], queryFn: () => repo.listTrips(), staleTime: 60_000 });
}

export function useTripBundle(tripId: string | undefined) {
  const repo = useTripRepo();
  return useQuery({
    queryKey: bundleKey(tripId ?? ''),
    queryFn: () => repo.getBundle(tripId!),
    enabled: Boolean(tripId),
    staleTime: 30_000,
  });
}

export function useCreateTrip() {
  const repo = useTripRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTripInput) => repo.createTrip(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trip', 'list'] }),
  });
}

/**
 * 行程写操作统一走这里：一律乐观更新。
 * 拖拽排程如果等网络往返会明显卡顿，这是 PC 端"趁手"的关键。
 */
export function useTripMutations(tripId: string) {
  const repo = useTripRepo();
  const qc = useQueryClient();
  const key = bundleKey(tripId);

  function optimistic(update: (b: TripBundle) => TripBundle) {
    const prev = qc.getQueryData<TripBundle | null>(key);
    if (prev) qc.setQueryData(key, update(structuredClone(prev)));
    return prev;
  }

  const settle = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ['trip', 'list'] });
  };

  const rollback = (prev: TripBundle | null | undefined) => {
    if (prev !== undefined) qc.setQueryData(key, prev);
  };

  const addDay = useMutation({
    mutationFn: (v: { date: string; cityId?: string | null }) =>
      repo.addDay(tripId, v.date, v.cityId ?? null),
    onSuccess: settle,
  });

  const updateDay = useMutation({
    mutationFn: (v: { id: string; patch: Partial<TripDay> }) => repo.updateDay(v.id, v.patch),
    onMutate: (v) =>
      optimistic((b) => {
        const d = b.days.find((x) => x.id === v.id);
        if (d) Object.assign(d, v.patch);
        return b;
      }),
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  });

  const removeDay = useMutation({
    mutationFn: (id: string) => repo.removeDay(id),
    onSuccess: settle,
  });

  const addItem = useMutation({
    mutationFn: (input: Omit<AddItemInput, 'tripId'>) => repo.addItem({ ...input, tripId }),
    onSuccess: settle,
  });

  const updateItem = useMutation({
    mutationFn: (v: { id: string; patch: Partial<TripItem> }) => repo.updateItem(v.id, v.patch),
    onMutate: (v) =>
      optimistic((b) => {
        const it = b.items.find((x) => x.id === v.id);
        if (it) Object.assign(it, v.patch);
        return b;
      }),
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  });

  const moveItem = useMutation({
    mutationFn: (v: { id: string; dayId: string | null; rank: string }) =>
      repo.moveItem(v.id, { dayId: v.dayId, rank: v.rank }),
    onMutate: (v) =>
      optimistic((b) => {
        const it = b.items.find((x) => x.id === v.id);
        if (it) {
          it.dayId = v.dayId;
          it.rank = v.rank;
        }
        return b;
      }),
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  });

  const removeItem = useMutation({
    mutationFn: (id: string) => repo.removeItem(id),
    onMutate: (id) =>
      optimistic((b) => {
        b.items = b.items.filter((x) => x.id !== id);
        return b;
      }),
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  });

  const addMember = useMutation({
    mutationFn: (displayName: string) => repo.addMember(tripId, displayName),
    onSuccess: settle,
  });

  const vote = useMutation({
    mutationFn: (v: { itemId: string; memberId: string; value: 1 | -1 | 0 }) =>
      repo.vote(v.itemId, v.memberId, v.value),
    onMutate: (v) =>
      optimistic((b) => {
        b.votes = b.votes.filter((x) => !(x.itemId === v.itemId && x.memberId === v.memberId));
        if (v.value !== 0) b.votes.push({ itemId: v.itemId, memberId: v.memberId, value: v.value });
        return b;
      }),
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  });

  const updateTrip = useMutation({
    mutationFn: (patch: Partial<Trip>) => repo.updateTrip(tripId, patch),
    onMutate: (patch) =>
      optimistic((b) => {
        Object.assign(b.trip, patch);
        return b;
      }),
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  });

  const setPacking = useMutation({
    mutationFn: (packing: PackingItem[]) => repo.updateTrip(tripId, { packing }),
    onMutate: (packing) =>
      optimistic((b) => {
        b.trip.packing = packing;
        return b;
      }),
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  });

  const upsertExpense = useMutation({
    mutationFn: (input: Omit<Expense, 'id'> & { id?: string }) => repo.upsertExpense(input),
    onSuccess: settle,
  });

  const removeExpense = useMutation({
    mutationFn: (id: string) => repo.removeExpense(id),
    onMutate: (id) =>
      optimistic((b) => {
        b.expenses = b.expenses.filter((e) => e.id !== id);
        return b;
      }),
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  });

  const upsertTicket = useMutation({
    mutationFn: (input: Omit<Ticket, 'id'> & { id?: string }) => repo.upsertTicket(input),
    onMutate: (input) =>
      optimistic((b) => {
        const idx = b.tickets.findIndex((t) => t.id === input.id);
        const next: Ticket = {
          ...input,
          id: input.id ?? `tmp-${Date.now()}`,
          tripId,
          itemId: input.itemId ?? null,
        };
        if (idx >= 0) b.tickets[idx] = next;
        else b.tickets.push(next);
        return b;
      }),
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  });

  const removeTicket = useMutation({
    mutationFn: (id: string) => repo.removeTicket(id),
    onMutate: (id) =>
      optimistic((b) => {
        b.tickets = b.tickets.filter((t) => t.id !== id);
        return b;
      }),
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  });

  return {
    addDay,
    updateDay,
    removeDay,
    addItem,
    updateItem,
    moveItem,
    removeItem,
    addMember,
    vote,
    updateTrip,
    setPacking,
    upsertExpense,
    removeExpense,
    upsertTicket,
    removeTicket,
  };
}
