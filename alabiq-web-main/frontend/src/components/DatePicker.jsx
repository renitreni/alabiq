import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import BottomDrawer from './BottomDrawer';
import { usePickerDrawer } from '../lib/useMediaQuery';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const PANEL_HEIGHT = 360;
const PANEL_WIDTH = 340;

function pad(n) {
  return String(n).padStart(2, '0');
}

function parseDateOnly(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).slice(0, 10));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function toDateOnly(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDisplay(value) {
  const d = parseDateOnly(value);
  if (!d) return '';
  return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  return cells;
}

function computePopoverPosition(triggerEl) {
  const rect = triggerEl.getBoundingClientRect();
  const width = Math.min(PANEL_WIDTH, window.innerWidth - 32);
  let left = rect.left;
  left = Math.max(16, Math.min(left, window.innerWidth - width - 16));
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const openUpward = spaceBelow < PANEL_HEIGHT && spaceAbove > spaceBelow;
  let top = openUpward ? rect.top - PANEL_HEIGHT - 6 : rect.bottom + 6;
  top = Math.max(8, Math.min(top, window.innerHeight - PANEL_HEIGHT - 8));
  return { top, left, width, openUpward };
}

function CalendarPanel({
  viewYear,
  viewMonth,
  calendarDays,
  activeDate,
  today,
  min,
  max,
  goMonth,
  selectDay,
  onClear,
  onToday,
  allowClear,
  inDrawer = false,
}) {
  return (
    <div className={inDrawer ? '' : 'bg-white border border-brand-border rounded-2xl shadow-xl shadow-brand-orange/10'}>
      <div className={inDrawer ? '' : 'p-4 pb-3'}>
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => goMonth(-1)}
            className="p-2 rounded-xl hover:bg-brand-surface text-brand-grey hover:text-brand-orange transition-colors cursor-pointer"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-black text-brand-black">
            {MONTHS[viewMonth]} {viewYear}
          </span>
          <button
            type="button"
            onClick={() => goMonth(1)}
            className="p-2 rounded-xl hover:bg-brand-surface text-brand-grey hover:text-brand-orange transition-colors cursor-pointer"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="text-[10px] font-bold text-brand-grey uppercase text-center py-1">
              {wd}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />;
            const cellDate = new Date(viewYear, viewMonth, day);
            const isSelected = activeDate && isSameDay(cellDate, activeDate);
            const isToday = isSameDay(cellDate, today);
            const tooEarly = min && cellDate < min;
            const tooLate = max && cellDate > max;
            const disabled = tooEarly || tooLate;
            return (
              <button
                key={day}
                type="button"
                disabled={disabled}
                onClick={() => selectDay(day)}
                className={`h-10 rounded-xl text-sm font-medium transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                  isSelected
                    ? 'bg-brand-orange text-white font-bold shadow-md shadow-brand-orange/25'
                    : isToday
                      ? 'text-brand-orange font-bold ring-2 ring-brand-orange/30 hover:bg-brand-warm'
                      : 'text-brand-dark hover:bg-brand-warm hover:text-brand-orange'
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`flex items-center ${allowClear ? 'justify-between' : 'justify-end'} gap-2 px-4 py-3 border-t border-brand-border bg-brand-surface/40 ${inDrawer ? 'px-0 mt-3 rounded-xl' : 'rounded-b-2xl'}`}>
        {allowClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-sm font-bold text-brand-grey hover:text-brand-orange transition-colors cursor-pointer"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={onToday}
          className="text-sm font-black text-brand-orange hover:text-brand-orange/80 transition-colors cursor-pointer"
        >
          Today
        </button>
      </div>
    </div>
  );
}

export default function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = 'Pick a date',
  drawerTitle = 'Choose a date',
  allowClear = false,
  className = '',
}) {
  const wrapRef = useRef(null);
  const popoverRef = useRef(null);
  const triggerRef = useRef(null);
  const useDrawer = usePickerDrawer();
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState({ top: 0, left: 0, width: PANEL_WIDTH, openUpward: false });

  const selected = parseDateOnly(value);
  const today = startOfDay(new Date());
  const minDate = min ? startOfDay(parseDateOnly(min) || today) : null;
  const maxDate = max ? startOfDay(parseDateOnly(max) || today) : null;

  const [viewYear, setViewYear] = useState(() => (selected || today).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (selected || today).getMonth());

  useEffect(() => {
    if (!open) return undefined;
    const d = selected || today;
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    return undefined;
  }, [open, value]);

  const updatePopoverPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setPopoverStyle(computePopoverPosition(trigger));
  }, []);

  useEffect(() => {
    if (!open || useDrawer) return undefined;
    updatePopoverPosition();
    window.addEventListener('resize', updatePopoverPosition);
    window.addEventListener('scroll', updatePopoverPosition, true);
    return () => {
      window.removeEventListener('resize', updatePopoverPosition);
      window.removeEventListener('scroll', updatePopoverPosition, true);
    };
  }, [open, useDrawer, updatePopoverPosition]);

  useEffect(() => {
    if (!open || useDrawer) return undefined;
    function handleClick(e) {
      const inTrigger = wrapRef.current?.contains(e.target);
      const inPopover = popoverRef.current?.contains(e.target);
      if (!inTrigger && !inPopover) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, useDrawer]);

  const calendarDays = useMemo(() => getCalendarDays(viewYear, viewMonth), [viewYear, viewMonth]);
  const display = formatDisplay(value);

  function goMonth(delta) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function commit(date) {
    onChange(toDateOnly(date));
    setOpen(false);
  }

  function selectDay(day) {
    commit(new Date(viewYear, viewMonth, day));
  }

  const panelProps = {
    viewYear,
    viewMonth,
    calendarDays,
    activeDate: selected,
    today,
    min: minDate,
    max: maxDate,
    goMonth,
    selectDay,
    onClear: () => {
      onChange('');
      setOpen(false);
    },
    onToday: () => {
      let d = today;
      if (maxDate && d > maxDate) d = maxDate;
      if (minDate && d < minDate) d = minDate;
      commit(d);
    },
    allowClear,
  };

  return (
    <div ref={wrapRef} className={`relative min-w-0 ${open && !useDrawer ? 'z-50' : 'z-0'} ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          if (!useDrawer) updatePopoverPosition();
          setOpen(true);
        }}
        className={`w-full min-w-0 bg-white border rounded-xl px-4 py-3 text-sm transition-all cursor-pointer flex items-center gap-2.5 focus:outline-none ${
          open
            ? 'border-brand-orange ring-2 ring-brand-orange/15'
            : 'border-brand-border focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15'
        }`}
      >
        <Calendar className={`w-4 h-4 shrink-0 ${open || value ? 'text-brand-orange' : 'text-brand-grey'}`} />
        <span className={`flex-1 text-left truncate ${value ? 'font-semibold text-brand-dark' : 'text-brand-grey'}`}>
          {display || placeholder}
        </span>
      </button>

      {useDrawer ? (
        <BottomDrawer open={open} onClose={() => setOpen(false)} title={drawerTitle}>
          <CalendarPanel {...panelProps} inDrawer />
        </BottomDrawer>
      ) : (
        typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={popoverRef}
                initial={{ opacity: 0, y: popoverStyle.openUpward ? 6 : -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: popoverStyle.openUpward ? 6 : -6, scale: 0.98 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                style={{
                  position: 'fixed',
                  top: popoverStyle.top,
                  left: popoverStyle.left,
                  width: popoverStyle.width,
                  zIndex: 9999,
                }}
              >
                <CalendarPanel {...panelProps} />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )
      )}
    </div>
  );
}
