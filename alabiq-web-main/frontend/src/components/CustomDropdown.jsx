import { useState, useRef, useEffect } from 'react';

import { motion, AnimatePresence } from 'framer-motion';

import { Check, ChevronDown } from 'lucide-react';

import BottomDrawer from './BottomDrawer';

import { useIsMobile } from '../lib/useMediaQuery';



const selectTriggerClass =

  'w-full min-w-0 bg-white border rounded-xl text-sm transition-all cursor-pointer ' +

  'focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15';



function OptionLabel({ label, sublabel, active = false, size = 'sm' }) {

  if (!sublabel) {

    return (

      <span className={`${size === 'sm' ? 'text-sm' : 'text-base'} font-medium text-left whitespace-normal`}>

        {label}

      </span>

    );

  }

  return (

    <span className="flex flex-col items-start text-left leading-tight min-w-0">

      <span className={`font-bold ${active ? 'text-brand-orange' : 'text-brand-dark'}`}>{label}</span>

      <span className={`text-xs mt-0.5 ${active ? 'text-brand-orange/80' : 'text-brand-grey'}`}>{sublabel}</span>

    </span>

  );

}



function OptionsList({ value, options, onChange, onSelect, mobile = false }) {

  return (

    <ul role="listbox" className={mobile ? 'space-y-1' : 'py-1.5 max-h-60 overflow-y-auto overscroll-contain'}>

      {options.map((opt) => {

        const active = value === opt.value;

        return (

          <li key={opt.value} role="option" aria-selected={active}>

            <button

              type="button"

              onClick={() => {

                onChange(opt.value);

                onSelect?.();

              }}

              className={`w-full flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${

                mobile ? 'px-4 py-4 rounded-xl text-base' : 'px-3.5 py-3 text-sm'

              } ${

                active

                  ? 'bg-brand-warm'

                  : mobile

                    ? 'hover:bg-brand-surface active:bg-brand-surface'

                    : 'hover:bg-brand-surface'

              }`}

            >

              <OptionLabel label={opt.label} sublabel={opt.sublabel} active={active} size={mobile ? 'base' : 'sm'} />

              {active && <Check className="w-4 h-4 shrink-0 text-brand-orange" />}

            </button>

          </li>

        );

      })}

    </ul>

  );

}



export default function CustomDropdown({

  value,

  onChange,

  options,

  placeholder = 'Select',

  drawerTitle,

  hasError = false,

  allowEmpty = true,

  compact = false,

  className = '',

}) {

  const [open, setOpen] = useState(false);

  const ref = useRef(null);

  const isMobile = useIsMobile();

  const title = drawerTitle || placeholder;



  useEffect(() => {

    if (!open || isMobile) return undefined;

    function handleClick(e) {

      if (ref.current && !ref.current.contains(e.target)) setOpen(false);

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

  }, [open, isMobile]);



  const selected = options.find((o) => o.value === value);

  const borderClass = hasError ? 'border-red-300 ring-2 ring-red-100' : 'border-brand-border';



  return (

    <div ref={ref} className={`relative ${open && !isMobile ? 'z-50' : 'z-0'} ${className}`}>

      <button

        type="button"

        aria-haspopup="listbox"

        aria-expanded={open}

        onClick={() => setOpen((o) => !o)}

        className={`${selectTriggerClass} flex items-center justify-between gap-3 ${borderClass} ${

          compact ? 'px-3 py-3' : 'px-4 py-3'

        } ${open ? 'border-brand-orange ring-2 ring-brand-orange/15' : ''}`}

      >

        {selected ? (

          <OptionLabel label={selected.label} sublabel={selected.sublabel} />

        ) : (

          <span className="text-brand-grey text-left">{placeholder}</span>

        )}

        <ChevronDown

          className={`w-4 h-4 text-brand-grey shrink-0 transition-transform duration-200 ${

            open ? 'rotate-180 text-brand-orange' : ''

          }`}

        />

      </button>



      {isMobile ? (

        <BottomDrawer open={open} onClose={() => setOpen(false)} title={title}>

          <OptionsList

            value={value}

            options={options}

            onChange={onChange}

            onSelect={() => setOpen(false)}

            mobile

          />

        </BottomDrawer>

      ) : (

        <AnimatePresence>

          {open && (

            <motion.div

              initial={{ opacity: 0, y: -6, scale: 0.98 }}

              animate={{ opacity: 1, y: 0, scale: 1 }}

              exit={{ opacity: 0, y: -6, scale: 0.98 }}

              transition={{ duration: 0.15, ease: 'easeOut' }}

              className={`absolute top-[calc(100%+6px)] left-0 z-50 min-w-full w-max max-w-[min(100vw-2rem,22rem)] ${

                compact ? 'min-w-[12rem]' : ''

              }`}

            >

              <div className="bg-white border border-brand-border rounded-xl shadow-xl shadow-brand-orange/10">

                <OptionsList

                  value={value}

                  options={options}

                  onChange={onChange}

                  onSelect={() => setOpen(false)}

                />

              </div>

            </motion.div>

          )}

        </AnimatePresence>

      )}

    </div>

  );

}


