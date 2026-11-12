import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

import { createPortal } from 'react-dom';

import { motion, AnimatePresence } from 'framer-motion';

import { Calendar, ChevronLeft, ChevronRight, ChevronDown, Clock, Check } from 'lucide-react';

import BottomDrawer from './BottomDrawer';

import { usePickerDrawer } from '../lib/useMediaQuery';



const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const MONTHS = [

  'January', 'February', 'March', 'April', 'May', 'June',

  'July', 'August', 'September', 'October', 'November', 'December',

];

const MINUTE_STEP = 15;

const PANEL_HEIGHT = 420;

const PANEL_WIDTH = 380;



function computePopoverPosition(triggerEl) {

  const rect = triggerEl.getBoundingClientRect();

  const width = Math.min(PANEL_WIDTH, window.innerWidth - 32);

  let left = rect.right - width;

  left = Math.max(16, Math.min(left, window.innerWidth - width - 16));

  const spaceBelow = window.innerHeight - rect.bottom;

  const spaceAbove = rect.top;

  const openUpward = spaceBelow < PANEL_HEIGHT && spaceAbove > spaceBelow;

  let top = openUpward ? rect.top - PANEL_HEIGHT - 6 : rect.bottom + 6;

  top = Math.max(8, Math.min(top, window.innerHeight - PANEL_HEIGHT - 8));

  return { top, left, width, openUpward };

}



function pad(n) {

  return String(n).padStart(2, '0');

}



function parseValue(value) {

  if (!value) return null;

  const d = new Date(value);

  return Number.isNaN(d.getTime()) ? null : d;

}



function toValue(date) {

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

}



function formatDisplay(value) {

  const d = parseValue(value);

  if (!d) return { date: 'Select date', time: 'Select time' };

  const weekday = d.toLocaleString('en-GB', { weekday: 'short' });

  const dayMonth = d.toLocaleString('en-GB', { day: 'numeric', month: 'short' });

  const yearSuffix = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';

  const time = d.toLocaleString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });

  return { date: `${weekday}, ${dayMonth}${yearSuffix}`, time };

}



function formatPreview(year, month, day, hour12, minute, period) {

  const hour24 = (hour12 % 12) + (period === 'pm' ? 12 : 0);

  const d = new Date(year, month, day, hour24, minute);

  const weekday = d.toLocaleString('en-GB', { weekday: 'short' });

  const date = d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const time = d.toLocaleString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });

  return `${weekday}, ${date} · ${time}`;

}



function getCalendarDays(year, month) {

  const firstDay = new Date(year, month, 1).getDay();

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];

  for (let i = 0; i < firstDay; i++) cells.push(null);

  for (let day = 1; day <= daysInMonth; day++) cells.push(day);

  return cells;

}



function isSameDay(a, b) {

  return (

    a.getFullYear() === b.getFullYear() &&

    a.getMonth() === b.getMonth() &&

    a.getDate() === b.getDate()

  );

}



function roundMinuteToStep(minute) {

  return Math.min(45, Math.round(minute / MINUTE_STEP) * MINUTE_STEP);

}



function TimeSelect({ label, value, options, open, onOpenChange, onChange, menuPlacement = 'above' }) {

  const ref = useRef(null);

  const menuClass =

    menuPlacement === 'below'

      ? 'absolute top-[calc(100%+6px)] left-0 right-0 z-[60]'

      : 'absolute bottom-[calc(100%+6px)] left-0 right-0 z-[60]';



  useEffect(() => {

    if (!open) return undefined;

    function handleClick(e) {

      if (ref.current && !ref.current.contains(e.target)) onOpenChange(false);

    }

    function handleKey(e) {

      if (e.key === 'Escape') onOpenChange(false);

    }

    document.addEventListener('mousedown', handleClick);

    document.addEventListener('keydown', handleKey);

    return () => {

      document.removeEventListener('mousedown', handleClick);

      document.removeEventListener('keydown', handleKey);

    };

  }, [open, onOpenChange]);



  return (

    <div ref={ref} className={`relative flex-1 min-w-0 ${open ? 'z-[60]' : 'z-0'}`}>

      <button

        type="button"

        aria-haspopup="listbox"

        aria-expanded={open}

        aria-label={label}

        onClick={() => onOpenChange(!open)}

        className={`w-full flex items-center justify-between gap-1.5 bg-white border rounded-xl px-3 py-2.5 text-sm font-bold transition-all cursor-pointer focus:outline-none ${

          open

            ? 'border-brand-orange ring-2 ring-brand-orange/15 text-brand-orange'

            : 'border-brand-border text-brand-dark hover:border-brand-orange/40 focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15'

        }`}

      >

        <span>{pad(value)}</span>

        <ChevronDown

          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${

            open ? 'rotate-180 text-brand-orange' : 'text-brand-grey'

          }`}

        />

      </button>



      <AnimatePresence>

        {open && (

          <motion.ul

            role="listbox"

            aria-label={label}

            initial={{ opacity: 0, y: menuPlacement === 'below' ? -4 : 4, scale: 0.98 }}

            animate={{ opacity: 1, y: 0, scale: 1 }}

            exit={{ opacity: 0, y: menuPlacement === 'below' ? -4 : 4, scale: 0.98 }}

            transition={{ duration: 0.12, ease: 'easeOut' }}

            className={`${menuClass} bg-white border border-brand-border rounded-xl shadow-xl shadow-brand-orange/10 py-1 max-h-44 overflow-y-auto overscroll-contain`}

          >

            {options.map((opt) => {

              const active = value === opt;

              return (

                <li key={opt} role="option" aria-selected={active}>

                  <button

                    type="button"

                    onClick={() => {

                      onChange(opt);

                      onOpenChange(false);

                    }}

                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${

                      active

                        ? 'bg-brand-warm text-brand-orange'

                        : 'text-brand-dark hover:bg-brand-surface hover:text-brand-orange'

                    }`}

                  >

                    <span>{pad(opt)}</span>

                    {active && <Check className="w-3.5 h-3.5 shrink-0 text-brand-orange" />}

                  </button>

                </li>

              );

            })}

          </motion.ul>

        )}

      </AnimatePresence>

    </div>

  );

}



function PickerPanel({

  preview,

  viewYear,

  viewMonth,

  calendarDays,

  activeDate,

  today,

  min,

  goMonth,

  selectDay,

  hour12,

  minute,

  period,

  hourOptions,

  minuteOptions,

  timeDropdown,

  setTimeDropdown,

  updateTime,

  onClear,

  onNow,

  onDone,

  inDrawer = false,

}) {

  return (

    <div className={inDrawer ? '' : 'bg-white border border-brand-border rounded-2xl shadow-xl shadow-brand-orange/10'}>

      <div className={`px-4 py-3 bg-brand-warm/60 border-b border-brand-border ${inDrawer ? 'rounded-xl mb-4' : ''}`}>

        <p className="text-[10px] font-bold text-brand-grey uppercase tracking-wider mb-0.5">

          Selected pickup

        </p>

        <p className="text-sm font-bold text-brand-dark leading-snug">{preview}</p>

      </div>



      <div className={inDrawer ? '' : 'p-4'}>

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

            <div

              key={wd}

              className="text-[10px] font-bold text-brand-grey uppercase text-center py-1"

            >

              {wd}

            </div>

          ))}

        </div>



        <div className="grid grid-cols-7 gap-1">

          {calendarDays.map((day, i) => {

            if (day === null) return <div key={`empty-${i}`} />;

            const cellDate = new Date(viewYear, viewMonth, day);

            const isSelected = isSameDay(cellDate, activeDate);

            const isToday = isSameDay(cellDate, today);

            const todayStart = new Date(min.getFullYear(), min.getMonth(), min.getDate());

            const isPast = cellDate < todayStart;



            return (

              <button

                key={day}

                type="button"

                disabled={isPast}

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



      <div className={`px-4 pb-4 overflow-visible ${inDrawer ? 'px-0' : ''}`}>

        <p className="text-[10px] font-bold text-brand-grey uppercase tracking-wider mb-2">

          Pickup time

        </p>

        <div className="flex items-center gap-2">

          <TimeSelect

            label="Hour"

            value={hour12}

            options={hourOptions}

            open={timeDropdown === 'hour'}

            onOpenChange={(next) => setTimeDropdown(next ? 'hour' : null)}

            onChange={(h) => updateTime(h, null, null)}

            menuPlacement={inDrawer ? 'below' : 'above'}

          />

          <span className="text-brand-grey font-bold">:</span>

          <TimeSelect

            label="Minute"

            value={minute}

            options={minuteOptions}

            open={timeDropdown === 'minute'}

            onOpenChange={(next) => setTimeDropdown(next ? 'minute' : null)}

            onChange={(m) => updateTime(null, m, null)}

            menuPlacement={inDrawer ? 'below' : 'above'}

          />

          <div className="flex shrink-0 rounded-xl border border-brand-border overflow-hidden">

            {(['am', 'pm']).map((p) => {

              const active = period === p;

              return (

                <button

                  key={p}

                  type="button"

                  onClick={() => updateTime(null, null, p)}

                  className={`px-3 py-2.5 text-xs font-black uppercase transition-colors cursor-pointer ${

                    active

                      ? 'bg-brand-orange text-white'

                      : 'bg-white text-brand-grey hover:bg-brand-warm hover:text-brand-orange'

                  }`}

                >

                  {p}

                </button>

              );

            })}

          </div>

        </div>

      </div>



      <div className={`flex items-center justify-between gap-2 px-4 py-3 border-t border-brand-border bg-brand-surface/40 ${inDrawer ? 'px-0 mt-2 rounded-xl' : ''}`}>

        <button

          type="button"

          onClick={onClear}

          className="text-sm font-bold text-brand-grey hover:text-brand-orange transition-colors cursor-pointer"

        >

          Clear

        </button>

        <button

          type="button"

          onClick={onNow}

          className="text-sm font-bold text-brand-orange hover:text-brand-orange/80 transition-colors cursor-pointer"

        >

          Now

        </button>

        <button

          type="button"

          onClick={onDone}

          className="text-sm font-black bg-brand-orange text-white px-5 py-2.5 rounded-xl shadow-md shadow-brand-orange/20 hover:bg-brand-orange/90 transition-colors cursor-pointer"

        >

          Done

        </button>

      </div>

    </div>

  );

}



export default function DateTimePicker({ value, onChange, minDate, drawerTitle = 'Pickup date & time' }) {

  const ref = useRef(null);

  const popoverRef = useRef(null);

  const triggerRef = useRef(null);

  const useDrawer = usePickerDrawer();

  const [open, setOpen] = useState(false);

  const [popoverStyle, setPopoverStyle] = useState({ top: 0, left: 0, width: PANEL_WIDTH, openUpward: false });

  const selected = parseValue(value) || new Date();

  const min = minDate || new Date();



  const [viewYear, setViewYear] = useState(selected.getFullYear());

  const [viewMonth, setViewMonth] = useState(selected.getMonth());

  const [draftDay, setDraftDay] = useState(selected.getDate());

  const [hour12, setHour12] = useState(() => {

    const h = selected.getHours() % 12;

    return h === 0 ? 12 : h;

  });

  const [minute, setMinute] = useState(() => roundMinuteToStep(selected.getMinutes()));

  const [period, setPeriod] = useState(selected.getHours() >= 12 ? 'pm' : 'am');

  const [timeDropdown, setTimeDropdown] = useState(null);



  useEffect(() => {

    if (!open) setTimeDropdown(null);

  }, [open]);



  useEffect(() => {

    if (!open) return undefined;

    const d = parseValue(value) || new Date();

    setViewYear(d.getFullYear());

    setViewMonth(d.getMonth());

    setDraftDay(d.getDate());

    const h = d.getHours() % 12;

    setHour12(h === 0 ? 12 : h);

    setMinute(roundMinuteToStep(d.getMinutes()));

    setPeriod(d.getHours() >= 12 ? 'pm' : 'am');

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

      const inTrigger = ref.current?.contains(e.target);

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

  const preview = formatPreview(viewYear, viewMonth, draftDay, hour12, minute, period);



  const hourOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  const minuteOptions = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);



  function applySelection(day, nextHour12, nextMinute, nextPeriod) {

    const h = nextHour12 ?? hour12;

    const m = nextMinute ?? minute;

    const p = nextPeriod ?? period;

    let hour24 = h % 12;

    if (p === 'pm') hour24 += 12;

    const next = new Date(viewYear, viewMonth, day, hour24, m, 0, 0);

    if (next < min) return;

    onChange(toValue(next));

  }



  function selectDay(day) {

    setDraftDay(day);

    applySelection(day, null, null, null);

  }



  function updateTime(nextHour12, nextMinute, nextPeriod) {

    if (nextHour12 != null) setHour12(nextHour12);

    if (nextMinute != null) setMinute(nextMinute);

    if (nextPeriod != null) setPeriod(nextPeriod);

    applySelection(draftDay, nextHour12, nextMinute, nextPeriod);

  }



  function goMonth(delta) {

    const d = new Date(viewYear, viewMonth + delta, 1);

    setViewYear(d.getFullYear());

    setViewMonth(d.getMonth());

  }



  function setToday() {

    const now = new Date();

    setViewYear(now.getFullYear());

    setViewMonth(now.getMonth());

    setDraftDay(now.getDate());

    const h = now.getHours() % 12;

    const nextHour = h === 0 ? 12 : h;

    const nextMinute = roundMinuteToStep(now.getMinutes());

    const nextPeriod = now.getHours() >= 12 ? 'pm' : 'am';

    setHour12(nextHour);

    setMinute(nextMinute);

    setPeriod(nextPeriod);

    onChange(toValue(now));

  }



  const today = new Date();

  const parsed = parseValue(value);

  const activeDate = parsed || new Date(viewYear, viewMonth, draftDay);



  const panelProps = {

    preview,

    viewYear,

    viewMonth,

    calendarDays,

    activeDate,

    today,

    min,

    goMonth,

    selectDay,

    hour12,

    minute,

    period,

    hourOptions,

    minuteOptions,

    timeDropdown,

    setTimeDropdown,

    updateTime,

    onClear: () => {

      onChange('');

      setOpen(false);

    },

    onNow: setToday,

    onDone: () => setOpen(false),

  };



  return (

    <div ref={ref} className={`relative ${open && !useDrawer ? 'z-50' : 'z-0'}`}>

      <button

        ref={triggerRef}

        type="button"

        onClick={() => {

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

        <span className="flex-1 text-left leading-tight">

          {value ? (

            <>

              <span className="block font-semibold text-brand-dark">{display.date}</span>

              <span className="block text-brand-orange font-bold mt-0.5">{display.time}</span>

            </>

          ) : (

            <span className="text-brand-grey">Pick date &amp; time</span>

          )}

        </span>

        {value && (

          <Clock className="w-4 h-4 shrink-0 text-brand-orange" aria-hidden="true" />

        )}

      </button>



      {useDrawer ? (

        <BottomDrawer open={open} onClose={() => setOpen(false)} title={drawerTitle}>

          <PickerPanel {...panelProps} inDrawer />

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

                <PickerPanel {...panelProps} />

              </motion.div>

            )}

          </AnimatePresence>,

          document.body,

        )

      )}

    </div>

  );

}


