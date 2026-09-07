'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import {
  format,
  addMonths,
  subMonths,
  addYears,
  subYears,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  addDays,
  isWithinInterval,
  startOfDay,
  differenceInDays,
} from 'date-fns';
import { useLocale, useTranslations } from 'next-intl';
import { getDateFnsLocale, formatAppDate } from '@/i18n/format';
import { useDeviceClass } from '@/hooks/use-device-class';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface DatePickerProps {
  value: Date | { from: Date; to: Date };
  onChange: (value: Date | { from: Date; to: Date }) => void;
  mode?: 'single' | 'range';
  highlightDate?: Date;
}

type PickerT = ReturnType<typeof useTranslations<'common.datePicker'>>;

/** Qual grade o seletor mostra: dias (padrão), meses do ano ou anos da década. */
type PickerView = 'days' | 'months' | 'years';

function getPresetGroups(t: PickerT) {
  return [
    {
      items: [
        { key: 'last3Months', label: t('last3Months') },
        { key: 'lastMonth', label: t('lastMonth') },
      ],
    },
    {
      items: [
        { key: 'lastWeek', label: t('lastWeek') },
        { key: 'today', label: t('today'), highlight: true },
        { key: 'thisWeek', label: t('thisWeek') },
        { key: 'thisMonth', label: t('thisMonth') },
        { key: 'fullMonth', label: t('fullMonth') },
      ],
    },
    {
      items: [
        { key: 'nextMonth', label: t('nextMonth') },
        { key: 'next3Months', label: t('next3Months') },
      ],
    },
  ];
}

const SINGLE_DROPDOWN_HEIGHT = 340;

/** Primeiro ano da década (2026 -> 2020). A grade mostra 12 anos a partir dele. */
const decadeStart = (d: Date) => Math.floor(d.getFullYear() / 10) * 10;

interface MonthYearPanelProps {
  view: 'months' | 'years';
  anchor: Date;
  monthNames: string[];
  /** Datas que devem aparecer marcadas (valor atual ou seleção em andamento). */
  selected: Date[];
  locale: string;
  cellClass: string;
  /** Mobile já tem a linha de título no cabeçalho da Sheet; o desktop precisa dela aqui. */
  showTitle?: boolean;
  onPickMonth: (monthIndex: number) => void;
  onPickYear: (year: number) => void;
  onHeaderClick: () => void;
  t: PickerT;
}

/** Grade 3x4 de meses ou anos, compartilhada pelo dropdown (desktop) e pela Sheet (mobile). */
function MonthYearPanel({
  view,
  anchor,
  monthNames,
  selected,
  locale,
  cellClass,
  showTitle = true,
  onPickMonth,
  onPickYear,
  onHeaderClick,
  t,
}: MonthYearPanelProps) {
  const today = new Date();
  const start = decadeStart(anchor);
  const years = Array.from({ length: 12 }, (_, i) => start + i);

  const cellBase =
    'flex items-center justify-center rounded-md text-sm cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground';

  return (
    <div className="flex flex-col gap-2">
      {showTitle && (
        <div className="flex h-7 items-center justify-center" aria-live="polite">
          {view === 'months' ? (
            <button
              type="button"
              aria-label={t('chooseYear')}
              className="rounded-md px-2 py-0.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={onHeaderClick}
            >
              {formatAppDate(anchor, 'yyyy', locale)}
            </button>
          ) : (
            <span className="text-sm font-medium text-foreground">
              {t('decadeRange', { start, end: start + 11 })}
            </span>
          )}
        </div>
      )}
      {view === 'months' ? (
        <div className="grid grid-cols-3 gap-2">
          {monthNames.map((name, i) => {
            const isSelected = selected.some(
              (d) => d.getFullYear() === anchor.getFullYear() && d.getMonth() === i
            );
            const isCurrent =
              today.getFullYear() === anchor.getFullYear() && today.getMonth() === i;
            return (
              <button
                key={name + i}
                type="button"
                className={[
                  cellBase,
                  cellClass,
                  'capitalize',
                  isSelected && 'bg-primary text-primary-foreground font-medium hover:bg-primary hover:text-primary-foreground',
                  isCurrent && !isSelected && 'font-bold text-foreground',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onPickMonth(i)}
              >
                {name}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {years.map((year) => {
            const isSelected = selected.some((d) => d.getFullYear() === year);
            const isCurrent = today.getFullYear() === year;
            // Os dois últimos já pertencem à próxima década: ficam apagados, mas clicáveis.
            const isOutside = year >= start + 10;
            return (
              <button
                key={year}
                type="button"
                className={[
                  cellBase,
                  cellClass,
                  isOutside && !isSelected && 'text-muted-foreground/60',
                  isSelected && 'bg-primary text-primary-foreground font-medium hover:bg-primary hover:text-primary-foreground',
                  isCurrent && !isSelected && 'font-bold text-foreground',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onPickYear(year)}
              >
                {year}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DatePicker({
  value,
  onChange,
  mode = 'range',
  highlightDate,
}: DatePickerProps) {
  const { isMobile } = useDeviceClass();
  const t = useTranslations('common.datePicker');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const dateFnsLocale = getDateFnsLocale(locale);
  const PRESET_GROUPS = getPresetGroups(t);
  const weekDays = Array.from({ length: 7 }, (_, i) =>
    dateFnsLocale.localize?.day((i as 0 | 1 | 2 | 3 | 4 | 5 | 6), { width: 'narrow' }) ?? ''
  );
  const monthNames = Array.from({ length: 12 }, (_, i) =>
    dateFnsLocale.localize?.month((i as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11), {
      width: 'abbreviated',
    }) ?? ''
  );
  const [isOpen, setIsOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [currentMonth, setCurrentMonth] = useState(
    mode === 'single'
      ? value instanceof Date
        ? value
        : new Date()
      : value && 'from' in value
        ? value.from
        : new Date()
  );

  const [tempRange, setTempRange] = useState<{
    from: Date;
    to: Date | null;
  } | null>(null);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);

  // Salto por mês/ano: a view só existe enquanto o seletor está aberto,
  // por isso ela volta para 'days' sempre que o seletor é aberto.
  const [view, setView] = useState<PickerView>('days');
  // Mês/ano que as grades de meses/anos estão olhando.
  const [anchor, setAnchor] = useState<Date>(currentMonth);
  // Qual grade abriu o painel (range: 0 = esquerda, 1 = direita).
  const [anchorIndex, setAnchorIndex] = useState<0 | 1>(0);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = containerRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideTrigger && !insideDropdown) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close on scroll
  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = () => setIsOpen(false);
    document.addEventListener('scroll', handleScroll, true);
    return () => document.removeEventListener('scroll', handleScroll, true);
  }, [isOpen]);

  // Desktop: Escape volta para os dias primeiro; nos dias, fecha como o Cancelar.
  useEffect(() => {
    if (!isOpen || isMobile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (view !== 'days') {
        setView('days');
      } else {
        setPendingDate(null);
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isMobile, view]);

  const computeDropdownStyle = (): React.CSSProperties => {
    if (!triggerRef.current) return { position: 'fixed', top: 0, left: 0 };

    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const dropdownWidth = mode === 'single' ? 280 : 640;
    const dropdownHeight = mode === 'single' ? SINGLE_DROPDOWN_HEIGHT : 380;

    let left = rect.right - dropdownWidth;
    if (left < 8) left = 8;
    if (left + dropdownWidth > vw - 8) left = vw - dropdownWidth - 8;

    const spaceBelow = vh - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    let top: number;
    if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
      top = rect.bottom + 4;
    } else {
      top = rect.top - dropdownHeight - 4;
    }

    return { position: 'fixed', top, left, right: 'auto', zIndex: 9999 };
  };

  const handleOpen = () => {
    if (!isOpen) {
      setDropdownStyle(computeDropdownStyle());
      setView('days');
    }
    setIsOpen((prev) => !prev);
  };

  // As setas navegam conforme a view: 1 mês, 1 ano ou 10 anos.
  const handlePrev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (view === 'days') setCurrentMonth(subMonths(currentMonth, 1));
    else if (view === 'months') setAnchor(subYears(anchor, 1));
    else setAnchor(subYears(anchor, 10));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (view === 'days') setCurrentMonth(addMonths(currentMonth, 1));
    else if (view === 'months') setAnchor(addYears(anchor, 1));
    else setAnchor(addYears(anchor, 10));
  };

  const navTitles =
    view === 'days'
      ? { prev: t('prevMonth'), next: t('nextMonth') }
      : view === 'months'
        ? { prev: t('prevYear'), next: t('nextYear') }
        : { prev: t('prevDecade'), next: t('nextDecade') };

  const openMonths = (month: Date, index: 0 | 1) => {
    setAnchor(startOfMonth(month));
    setAnchorIndex(index);
    setView('months');
  };

  const pickYear = (year: number) => {
    setAnchor(new Date(year, anchor.getMonth(), 1));
    setView('months');
  };

  const pickMonth = (monthIndex: number) => {
    const m = new Date(anchor.getFullYear(), monthIndex, 1);
    // Range: o mês escolhido cai na grade cujo cabeçalho foi clicado.
    setCurrentMonth(mode === 'range' ? subMonths(m, anchorIndex) : m);
    setView('days');
  };

  // Datas marcadas nas grades de meses/anos (valor atual ou seleção em andamento).
  const selectedDates: Date[] = (() => {
    if (mode === 'single') {
      const d = pendingDate ?? (value instanceof Date ? value : null);
      return d ? [d] : [];
    }
    if (tempRange) {
      return tempRange.to ? [tempRange.from, tempRange.to] : [tempRange.from];
    }
    if (value && 'from' in value) {
      const v = value as { from: Date; to: Date };
      return [v.from, v.to];
    }
    return [];
  })();

  const handleDayClick = (day: Date) => {
    setActivePreset(null);
    if (mode === 'single') {
      setPendingDate(day);
      return;
    }
    if (!tempRange || (tempRange.from && tempRange.to)) {
      setTempRange({ from: day, to: null });
    } else {
      const range =
        day < tempRange.from
          ? { from: day, to: tempRange.from }
          : { from: tempRange.from, to: day };
      setTempRange(null);
      onChange(range);
      setIsOpen(false);
    }
  };

  const applyPreset = (preset: string) => {
    const now = new Date();
    let range: { from: Date; to: Date } | null = null;

    switch (preset) {
      case 'last3Months': {
        const end = subMonths(now, 1);
        const start = subMonths(now, 3);
        range = { from: startOfMonth(start), to: endOfMonth(end) };
        break;
      }
      case 'lastMonth': {
        const m = subMonths(now, 1);
        range = { from: startOfMonth(m), to: endOfMonth(m) };
        break;
      }
      case 'lastWeek': {
        const lastSun = startOfWeek(now, { weekStartsOn: 0 });
        range = { from: lastSun, to: startOfDay(now) };
        break;
      }
      case 'today': {
        range = { from: startOfDay(now), to: startOfDay(now) };
        break;
      }
      case 'thisWeek': {
        const daysUntilSunday = now.getDay() === 0 ? 0 : 7 - now.getDay();
        const nextSun = addDays(startOfDay(now), daysUntilSunday);
        range = { from: startOfDay(now), to: nextSun };
        break;
      }
      case 'thisMonth': {
        range = { from: startOfDay(now), to: endOfMonth(now) };
        break;
      }
      case 'fullMonth': {
        range = { from: startOfMonth(now), to: endOfMonth(now) };
        break;
      }
      case 'nextMonth': {
        const m = addMonths(now, 1);
        range = { from: startOfMonth(m), to: endOfMonth(m) };
        break;
      }
      case 'next3Months': {
        const start = addMonths(now, 1);
        const end = addMonths(now, 3);
        range = { from: startOfMonth(start), to: endOfMonth(end) };
        break;
      }
    }

    if (range) {
      setActivePreset(preset);
      onChange(range);
      setCurrentMonth(range.from);
      setIsOpen(false);
    }
  };

  const renderCalendar = (month: Date, index: 0 | 1) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const rows: React.ReactElement[] = [];
    let days: React.ReactElement[] = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const currentDay = day;
        const isCurrentMonth = isSameMonth(currentDay, monthStart);

        const isSelected =
          mode === 'single'
            ? pendingDate
              ? isSameDay(currentDay, pendingDate)
              : value instanceof Date && isSameDay(currentDay, value)
            : tempRange
              ? isSameDay(currentDay, tempRange.from) ||
                (tempRange.to && isSameDay(currentDay, tempRange.to))
              : value &&
                'from' in value &&
                (isSameDay(currentDay, value.from) ||
                  isSameDay(currentDay, (value as { from: Date; to: Date }).to));

        const isInRange =
          mode === 'range' &&
          !isSelected &&
          (tempRange && tempRange.to
            ? isWithinInterval(currentDay, {
                start: tempRange.from,
                end: tempRange.to,
              })
            : value &&
              'from' in value &&
              isWithinInterval(currentDay, {
                start: value.from,
                end: (value as { from: Date; to: Date }).to,
              }));

        const isHighlighted =
          highlightDate && isSameDay(currentDay, highlightDate);
        const isToday = isSameDay(currentDay, new Date());

        days.push(
          <div
            key={currentDay.toString()}
            className={[
              'flex h-8 w-8 items-center justify-center rounded-md text-sm cursor-pointer transition-colors',
              !isCurrentMonth && 'text-muted-foreground/40',
              isCurrentMonth && !isSelected && !isInRange && 'hover:bg-accent hover:text-accent-foreground',
              isSelected && 'bg-primary text-primary-foreground font-medium',
              isInRange && 'bg-accent text-accent-foreground',
              isHighlighted && !isSelected && 'ring-2 ring-ring ring-offset-1 ring-offset-background',
              isToday && !isSelected && 'font-bold text-foreground',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => isCurrentMonth && handleDayClick(currentDay)}
          >
            {format(currentDay, 'd')}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7 gap-0.5" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }

    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          aria-label={t('chooseMonth')}
          className="mx-auto rounded-md px-2 text-sm font-medium capitalize text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={() => openMonths(month, index)}
        >
          {formatAppDate(month, 'MMMM yyyy', locale)}
        </button>
        <div className="grid grid-cols-7 gap-0.5">
          {weekDays.map((d, i) => (
            <div
              key={`${d}-${i}`}
              className="flex h-8 w-8 items-center justify-center text-xs font-medium text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>
        {rows}
      </div>
    );
  };

  const displayValue = () => {
    if (mode === 'single') {
      return value instanceof Date
        ? format(value, 'dd/MM/yyyy')
        : t('selectDate');
    }
    if (value && 'from' in value) {
      const v = value as { from: Date; to: Date };
      return `${format(v.from, 'dd/MM/yyyy')} – ${format(v.to, 'dd/MM/yyyy')}`;
    }
    return tCommon('selectPeriod');
  };

  const dayCount = (() => {
    if (mode !== 'range' || !(value && 'from' in value)) return null;
    const v = value as { from: Date; to: Date };
    return differenceInDays(v.to, v.from) + 1;
  })();

  const dropdownContent = (
    <div
      ref={dropdownRef}
      className={[
        'rounded-lg border border-border bg-popover text-popover-foreground shadow-lg',
        mode === 'single' ? 'w-[280px] p-3' : 'flex w-[640px]',
      ].join(' ')}
      style={dropdownStyle}
    >
      {/* Sidebar with presets */}
      {mode === 'range' && (
        <nav
          className="flex w-[160px] flex-col gap-1 border-r border-border p-3"
          aria-label={t('shortcutsAria')}
        >
          {PRESET_GROUPS.map((group, gi) => (
            <div key={gi} className="flex flex-col gap-0.5">
              {gi > 0 && <div className="my-1 h-px bg-border" />}
              {group.items.map(({ key, label, highlight }) => (
                <button
                  key={key}
                  type="button"
                  className={[
                    'rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
                    activePreset === key
                      ? 'bg-primary text-primary-foreground font-medium'
                      : highlight
                        ? 'font-medium text-foreground hover:bg-accent'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  ].join(' ')}
                  onClick={() => applyPreset(key)}
                  title={label}
                >
                  {label}
                </button>
              ))}
            </div>
          ))}
        </nav>
      )}

      {/* Main calendars area */}
      <div className="flex flex-1 flex-col">
        <div className="relative flex items-start gap-6 p-3">
          <button
            type="button"
            className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={handlePrev}
            title={navTitles.prev}
          >
            <ChevronLeft size={16} />
          </button>

          {/* min-h fixa a altura da caixa entre as views (a posição é calculada só ao abrir). */}
          <div className="flex min-h-[300px] flex-1 justify-center gap-6">
            {view === 'days' ? (
              <>
                {renderCalendar(currentMonth, 0)}
                {mode === 'range' && renderCalendar(addMonths(currentMonth, 1), 1)}
              </>
            ) : (
              <div className="w-[236px]">
                <MonthYearPanel
                  view={view}
                  anchor={anchor}
                  monthNames={monthNames}
                  selected={selectedDates}
                  locale={locale}
                  cellClass="h-10"
                  onPickMonth={pickMonth}
                  onPickYear={pickYear}
                  onHeaderClick={() => setView('years')}
                  t={t}
                />
              </div>
            )}
          </div>

          <button
            type="button"
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={handleNext}
            title={navTitles.next}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          <div>
            {view !== 'days' && (
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={() => setView('days')}
              >
                {t('backToDays')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                setPendingDate(null);
                setIsOpen(false);
              }}
            >
              {tCommon('cancel')}
            </button>
            {mode === 'single' && (
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                disabled={!pendingDate}
                onClick={() => {
                  if (pendingDate) {
                    onChange(pendingDate);
                    setPendingDate(null);
                    setIsOpen(false);
                  }
                }}
              >
                {tCommon('confirm')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Mobile: Sheet bottom ──────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div ref={containerRef}>
        {/* Trigger Button */}
        <button
          ref={triggerRef}
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={() => {
            setView('days');
            setIsOpen(true);
          }}
          aria-label={t('openPicker')}
        >
          <CalendarIcon size={14} className="text-muted-foreground" />
          <span>{displayValue()}</span>
          {dayCount !== null && dayCount > 1 && (
            <span className="ml-1 flex h-5 items-center rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              {t('dayCountBadge', { count: dayCount })}
            </span>
          )}
        </button>

        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetContent
            side="bottom"
            className="h-auto max-h-[90dvh] flex flex-col gap-0 pb-safe px-0"
            onEscapeKeyDown={(e) => {
              // Escape volta para os dias antes de fechar a Sheet.
              if (view !== 'days') {
                e.preventDefault();
                setView('days');
              }
            }}
          >
            <SheetHeader className="px-4 pt-4 pb-3 border-b">
              <SheetTitle className="text-sm font-semibold">
                {mode === 'single' ? t('selectDate') : tCommon('selectPeriod')}
              </SheetTitle>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto overscroll-contain">
              {/* Presets em lista (mobile) */}
              {mode === 'range' && (
                <div className="px-4 py-3 border-b">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">{t('shortcuts')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_GROUPS.flatMap(g => g.items).map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        className={[
                          'rounded-full px-3 py-1 text-xs transition-colors border',
                          activePreset === key
                            ? 'bg-primary text-primary-foreground border-primary font-medium'
                            : 'border-border text-muted-foreground hover:bg-accent',
                        ].join(' ')}
                        onClick={() => applyPreset(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Calendário único centralizado */}
              <div className="px-4 py-4">
                <div className="flex items-center justify-between mb-3" aria-live="polite">
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
                    onClick={handlePrev}
                    title={navTitles.prev}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {view === 'days' ? (
                    <button
                      type="button"
                      aria-label={t('chooseMonth')}
                      className="rounded-md px-2 py-1 text-sm font-medium capitalize transition-colors hover:bg-accent"
                      onClick={() => openMonths(currentMonth, 0)}
                    >
                      {formatAppDate(currentMonth, 'MMMM yyyy', locale)}
                    </button>
                  ) : view === 'months' ? (
                    <button
                      type="button"
                      aria-label={t('chooseYear')}
                      className="rounded-md px-2 py-1 text-sm font-medium transition-colors hover:bg-accent"
                      onClick={() => setView('years')}
                    >
                      {formatAppDate(anchor, 'yyyy', locale)}
                    </button>
                  ) : (
                    <span className="text-sm font-medium">
                      {t('decadeRange', {
                        start: decadeStart(anchor),
                        end: decadeStart(anchor) + 11,
                      })}
                    </span>
                  )}
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
                    onClick={handleNext}
                    title={navTitles.next}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                {view !== 'days' ? (
                  <MonthYearPanel
                    view={view}
                    anchor={anchor}
                    monthNames={monthNames}
                    selected={selectedDates}
                    locale={locale}
                    cellClass="h-12 touch-target"
                    showTitle={false}
                    onPickMonth={pickMonth}
                    onPickYear={pickYear}
                    onHeaderClick={() => setView('years')}
                    t={t}
                  />
                ) : (
                  /* Grid do calendário — sem o header de mês (já temos acima) */
                  (() => {
                  const monthStart = startOfMonth(currentMonth);
                  const monthEnd = endOfMonth(monthStart);
                  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
                  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });
                  const rows: React.ReactElement[] = [];
                  let days: React.ReactElement[] = [];
                  let day = startDate;

                  while (day <= endDate) {
                    for (let i = 0; i < 7; i++) {
                      const currentDay = day;
                      const isCurrentMonth = isSameMonth(currentDay, monthStart);
                      const isSelected =
                        mode === 'single'
                          ? pendingDate
                            ? isSameDay(currentDay, pendingDate)
                            : value instanceof Date && isSameDay(currentDay, value)
                          : tempRange
                            ? isSameDay(currentDay, tempRange.from) ||
                              (tempRange.to && isSameDay(currentDay, tempRange.to))
                            : value &&
                              'from' in value &&
                              (isSameDay(currentDay, value.from) ||
                                isSameDay(currentDay, (value as { from: Date; to: Date }).to));
                      const isInRange =
                        mode === 'range' &&
                        !isSelected &&
                        (tempRange && tempRange.to
                          ? isWithinInterval(currentDay, { start: tempRange.from, end: tempRange.to })
                          : value &&
                            'from' in value &&
                            isWithinInterval(currentDay, {
                              start: value.from,
                              end: (value as { from: Date; to: Date }).to,
                            }));
                      const isToday = isSameDay(currentDay, new Date());

                      days.push(
                        <div
                          key={currentDay.toString()}
                          className={[
                            'flex h-10 w-10 items-center justify-center rounded-md text-sm cursor-pointer transition-colors touch-target',
                            !isCurrentMonth && 'text-muted-foreground/40',
                            isCurrentMonth && !isSelected && !isInRange && 'hover:bg-accent hover:text-accent-foreground',
                            isSelected && 'bg-primary text-primary-foreground font-medium',
                            isInRange && 'bg-accent text-accent-foreground',
                            isToday && !isSelected && 'font-bold text-foreground',
                          ].filter(Boolean).join(' ')}
                          onClick={() => isCurrentMonth && handleDayClick(currentDay)}
                        >
                          {format(currentDay, 'd')}
                        </div>
                      );
                      day = addDays(day, 1);
                    }
                    rows.push(
                      <div className="grid grid-cols-7 gap-0.5" key={day.toString()}>{days}</div>
                    );
                    days = [];
                  }

                  return (
                    <>
                      <div className="grid grid-cols-7 gap-0.5 mb-1">
                        {weekDays.map((d, i) => (
                          <div key={`${d}-${i}`} className="flex h-8 w-10 items-center justify-center text-xs font-medium text-muted-foreground">
                            {d}
                          </div>
                        ))}
                      </div>
                      {rows}
                    </>
                  );
                  })()
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
              <div>
                {view !== 'days' && (
                  <button
                    type="button"
                    className="rounded-md px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
                    onClick={() => setView('days')}
                  >
                    {t('backToDays')}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-md px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
                  onClick={() => {
                    setPendingDate(null);
                    setIsOpen(false);
                  }}
                >
                  {tCommon('cancel')}
                </button>
                {mode === 'single' && (
                  <button
                    type="button"
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    disabled={!pendingDate}
                    onClick={() => {
                      if (pendingDate) {
                        onChange(pendingDate);
                        setPendingDate(null);
                        setIsOpen(false);
                      }
                    }}
                  >
                    {tCommon('confirm')}
                  </button>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  // ── Desktop / Tablet: dropdown via portal ─────────────────────────────────
  return (
    <div ref={containerRef}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        onClick={handleOpen}
        aria-label={t('openPicker')}
      >
        <CalendarIcon size={14} className="text-muted-foreground" />
        <span className="hidden sm:inline">{displayValue()}</span>
        <span className="sm:hidden">
          <CalendarIcon size={14} />
        </span>
        {dayCount !== null && dayCount > 1 && (
          <span className="ml-1 flex h-5 items-center rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            {t('dayCountBadge', { count: dayCount })}
          </span>
        )}
      </button>

      {/* Dropdown via portal */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(dropdownContent, document.body)}
    </div>
  );
}
