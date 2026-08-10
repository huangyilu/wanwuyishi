import { useQuery } from '@tanstack/react-query';
import { useWorld } from '../../data';
import type { PoiQuery } from '../../data/types';

/** 世界库是静态内容，版本变更由构建产物与 SW 处理，运行时永不过期 */
const STATIC = { staleTime: Infinity, gcTime: Infinity } as const;

export function useWorldIndex() {
  const world = useWorld();
  return useQuery({ queryKey: ['world', 'index'], queryFn: () => world.getIndex(), ...STATIC });
}

export function usePois(q: PoiQuery) {
  const world = useWorld();
  return useQuery({
    queryKey: ['world', 'pois', q],
    queryFn: () => world.listPois(q),
    ...STATIC,
  });
}

export function usePoi(id: string | null | undefined) {
  const world = useWorld();
  return useQuery({
    queryKey: ['world', 'poi', id],
    queryFn: () => world.getPoi(id!),
    enabled: Boolean(id),
    ...STATIC,
  });
}

export function usePoiMap(ids: string[]) {
  const world = useWorld();
  const key = [...ids].sort().join(',');
  return useQuery({
    queryKey: ['world', 'poi-map', key],
    queryFn: () => world.getPois(ids),
    enabled: ids.length > 0,
    ...STATIC,
  });
}

export function useCity(id: string | null | undefined) {
  const world = useWorld();
  return useQuery({
    queryKey: ['world', 'city', id],
    queryFn: () => world.getCity(id!),
    enabled: Boolean(id),
    ...STATIC,
  });
}

export function useCountry(id: string | null | undefined) {
  const world = useWorld();
  return useQuery({
    queryKey: ['world', 'country', id],
    queryFn: () => world.getCountry(id!),
    enabled: Boolean(id),
    ...STATIC,
  });
}
