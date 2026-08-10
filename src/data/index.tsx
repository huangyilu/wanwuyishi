/**
 * Repository 工厂与注入点。
 *
 * 全应用只有这一处 if：换后端、跑离线快照、单测替身，都在这里决定，
 * 视图层永远只认接口。
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { LocalTripRepository } from './adapters/local-trip';
import { StaticJsonWorldRepository } from './adapters/static-json-world';
import { SupabaseTripRepository } from './adapters/supabase-trip';
import { isSupabaseConfigured } from './supabase-client';
import type { TripRepository, WorldRepository } from './types';

export interface Repositories {
  world: WorldRepository;
  trip: TripRepository;
}

const RepoContext = createContext<Repositories | null>(null);

export function createRepositories(): Repositories {
  const trip: TripRepository = isSupabaseConfigured
    ? new SupabaseTripRepository()
    : new LocalTripRepository();
  return {
    world: new StaticJsonWorldRepository(),
    trip,
  };
}

export function RepositoryProvider({
  children,
  value,
}: {
  children: ReactNode;
  value?: Repositories;
}) {
  const repos = useMemo(() => value ?? createRepositories(), [value]);
  return <RepoContext.Provider value={repos}>{children}</RepoContext.Provider>;
}

export function useRepositories(): Repositories {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error('useRepositories 必须在 RepositoryProvider 内使用');
  return ctx;
}

export function useWorld(): WorldRepository {
  return useRepositories().world;
}

export function useTripRepo(): TripRepository {
  return useRepositories().trip;
}

export * from './types';
