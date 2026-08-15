'use client';

import React, { createContext, useContext } from 'react';
import { usePathname } from 'next/navigation';
import { getDefaultDateRange, getHydrationSafeDateRange } from '@/lib/date-range-defaults';
import { consumeFreshSessionMarker, purgePersistedFilters } from '@/lib/client-session-reset';

export interface DateRange {
  from: Date;
  to: Date;
}

interface DateRangeContextType {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
}

const DateRangeContext = createContext<DateRangeContextType | null>(null);

// Prefixo das chaves por rota e chave legada (sem sufixo). Se mudar, atualize também
// src/lib/client-session-reset.ts, que apaga essas chaves numa sessão nova.
const STORAGE_KEY_PREFIX = 'wiseveo-date-filters';
const LEGACY_STORAGE_KEY = 'wiseveo-date-filters';
const FALLBACK_SCOPE = 'global';

function buildStorageKey(scopeKey: string): string {
  return `${STORAGE_KEY_PREFIX}:${encodeURIComponent(scopeKey)}`;
}

function parseStoredDateRange(raw: string | null): DateRange | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { from?: string; to?: string };
    if (!parsed.from || !parsed.to) return null;

    const from = new Date(parsed.from);
    const to = new Date(parsed.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;

    return { from, to };
  } catch {
    return null;
  }
}

function resolveDateRangeScope(pathname: string | null, scopeKey?: string): string {
  if (scopeKey && scopeKey.trim().length > 0) {
    return scopeKey.trim();
  }

  if (!pathname || pathname.trim().length === 0) {
    return FALLBACK_SCOPE;
  }

  return pathname;
}

interface DateRangeProviderProps {
  children: React.ReactNode;
  scopeKey?: string;
}

export function DateRangeProvider({ children, scopeKey }: DateRangeProviderProps) {
  const pathname = usePathname();
  const resolvedScope = React.useMemo(
    () => resolveDateRangeScope(pathname, scopeKey),
    [pathname, scopeKey],
  );
  const storageKey = React.useMemo(() => buildStorageKey(resolvedScope), [resolvedScope]);

  // Estado inicial idêntico no servidor e no cliente (evita erro de hidratação); o
  // effect abaixo SEMPRE o substitui — pelo período salvo ou pelo default local.
  const [dateRange, setDateRange] = React.useState<DateRange>(() => getHydrationSafeDateRange(resolvedScope));
  const isHydratingScope = React.useRef(true);

  // Load from local storage on mount and whenever page scope changes
  React.useEffect(() => {
    isHydratingScope.current = true;
    try {
      // Sessão nova (ex.: usuário DEMO recém-provisionado neste navegador): descarta os
      // períodos/filtros do visitante anterior ANTES de ler o storage. O marcador é
      // consumido na primeira passagem; nas trocas de rota seguintes isto é no-op.
      if (consumeFreshSessionMarker()) {
        purgePersistedFilters(localStorage);
      }

      const persisted = parseStoredDateRange(localStorage.getItem(storageKey));
      if (persisted) {
        setDateRange(persisted);
        return;
      }

      const legacy = parseStoredDateRange(localStorage.getItem(LEGACY_STORAGE_KEY));
      if (legacy) {
        setDateRange(legacy);
        localStorage.setItem(storageKey, JSON.stringify({
          from: legacy.from.toISOString(),
          to: legacy.to.toISOString(),
        }));
        return;
      }

      setDateRange(getDefaultDateRange(resolvedScope));
    } catch (e) {
      console.error('Failed to parse date range from local storage', e);
      setDateRange(getDefaultDateRange(resolvedScope));
    } finally {
      isHydratingScope.current = false;
    }
  }, [storageKey, resolvedScope]);

  // Save to local storage when state changes
  React.useEffect(() => {
    if (isHydratingScope.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString()
      }));
    } catch (e) {
      console.error('Failed to save date range to local storage', e);
    }
  }, [dateRange, storageKey]);

  return (
    <DateRangeContext.Provider value={{ dateRange, setDateRange }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  const context = useContext(DateRangeContext);
  if (!context) {
    throw new Error('useDateRange must be used within a DateRangeProvider');
  }
  return context;
}
