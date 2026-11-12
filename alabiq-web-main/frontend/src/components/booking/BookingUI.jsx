import { Home, Plane, ArrowRight, ArrowDown, CircleDot } from 'lucide-react';
import { motion } from 'framer-motion';
import { openLegalModal } from '../../portal/lib/legal';
import { vatLabel } from '../../portal/lib/constants';

export function DirectionToggle({ value, onChange, variant = 'cards' }) {
  const options = [
    {
      id: 'house_to_airport',
      title: 'Home to Airport',
      from: { Icon: Home, label: 'Home' },
      to: { Icon: Plane, label: 'Airport' },
    },
    {
      id: 'airport_to_house',
      title: 'Airport to Home',
      from: { Icon: Plane, label: 'Airport' },
      to: { Icon: Home, label: 'Home' },
    },
  ];

  if (variant === 'inline') {
    return (
      <div className="grid grid-cols-2 gap-2.5 bg-brand-surface p-2 rounded-xl border border-brand-border">
        {options.map((opt) => {
          const active = value === opt.id;
          const FromIcon = opt.from.Icon;
          const ToIcon = opt.to.Icon;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`py-2.5 md:py-3 rounded-lg text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                active
                  ? 'bg-brand-orange text-white shadow-md shadow-brand-orange/20'
                  : 'text-brand-grey hover:text-brand-dark'
              }`}
            >
              <FromIcon size={16} />
              <span className="hidden sm:inline">{opt.from.label}</span>
              <ArrowRight size={13} />
              <ToIcon size={16} />
              <span className="hidden sm:inline">{opt.to.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {options.map((opt) => {
        const active = value === opt.id;
        const FromIcon = opt.from.Icon;
        const ToIcon = opt.to.Icon;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`group relative text-left rounded-2xl border-2 p-4 transition-all duration-200 cursor-pointer ${
              active
                ? 'border-brand-orange bg-brand-warm shadow-md shadow-brand-orange/10'
                : 'border-brand-border bg-white hover:border-brand-orange/40 hover:bg-brand-muted'
            }`}
          >
            {active && (
              <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-brand-orange" />
            )}
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-bold ${
                  active ? 'bg-brand-orange text-white' : 'bg-brand-surface text-brand-grey'
                }`}
              >
                <FromIcon size={12} />
                {opt.from.label}
              </span>
              <span className="text-brand-grey text-xs">→</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-bold ${
                  active ? 'bg-brand-dark text-white' : 'bg-brand-surface text-brand-grey'
                }`}
              >
                <ToIcon size={12} />
                {opt.to.label}
              </span>
            </div>
            <div className={`font-black text-sm ${active ? 'text-brand-black' : 'text-brand-dark'}`}>
              {opt.title}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function TripRoutePreview({ direction, airportName, homeLabel = 'Your address' }) {
  const toAirport = direction === 'house_to_airport';
  const pickup = toAirport
    ? { Icon: Home, label: homeLabel || 'Your address', sub: 'Pickup', color: 'bg-brand-orange' }
    : { Icon: Plane, label: airportName, sub: 'Pickup', color: 'bg-brand-dark' };
  const dropoff = toAirport
    ? { Icon: Plane, label: airportName, sub: 'Drop-off', color: 'bg-brand-dark' }
    : { Icon: Home, label: homeLabel || 'Your address', sub: 'Drop-off', color: 'bg-brand-orange' };

  const stops = [pickup, dropoff];

  return (
    <div className="rounded-2xl bg-brand-muted border border-brand-border p-4">
      <p className="text-[10px] font-bold text-brand-grey uppercase tracking-widest mb-3">Your route</p>
      <div className="space-y-0">
        {stops.map((stop, i) => {
          const Icon = stop.Icon;
          const isLast = i === stops.length - 1;
          return (
            <div key={stop.sub} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`w-9 h-9 rounded-xl ${stop.color} text-white flex items-center justify-center shrink-0 shadow-sm`}
                >
                  <Icon size={16} />
                </div>
                {!isLast && (
                  <div className="flex flex-col items-center py-1">
                    <div className="w-0.5 h-3 bg-brand-border" />
                    <ArrowDown size={12} className="text-brand-grey my-0.5" />
                    <div className="w-0.5 h-3 bg-brand-border" />
                  </div>
                )}
              </div>
              <div className={`min-w-0 ${isLast ? '' : 'pb-3'}`}>
                <p className="text-[10px] font-bold text-brand-orange uppercase tracking-wider">{stop.sub}</p>
                <p className="text-sm font-bold text-brand-black truncate">{stop.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FareSummary({ fare, showButton, buttonLabel, onButtonClick, busy, buttonDisabled, compact = false }) {
  // Every component of the price is itemised, so base + service fee + VAT always
  // sums to the total on screen. There used to be a `hideServiceFee` option for
  // the marketing section; it is gone on purpose — once VAT made the headline a
  // true all-in figure, suppressing one line left the breakdown not adding up.
  const displayTotal = fare.total;
  const vatAmount = Number(fare.vatAmount) || 0;

  if (compact) {
    return (
      <div className="pt-4 mt-1 border-t border-brand-border space-y-2">
        <div className="flex justify-between text-sm text-brand-grey">
          <span>Base fare</span>
          <span>SAR {fare.base.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm text-brand-grey">
          <span>Service fee ({fare.serviceFeePercent}%)</span>
          <span>SAR {fare.serviceFee.toFixed(2)}</span>
        </div>
        {vatAmount > 0 && (
          <div className="flex justify-between text-sm text-brand-grey">
            <span>{vatLabel(fare.vatRate)}</span>
            <span>SAR {vatAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-3 border-t border-brand-border gap-4">
          <div>
            <div className="text-xs font-bold text-brand-grey uppercase tracking-wide">Total</div>
            <div className="text-2xl md:text-3xl font-black text-brand-orange tabular-nums mt-0.5">SAR {displayTotal.toFixed(2)}</div>
          </div>
          {showButton && (
            <button
              type={onButtonClick ? 'button' : 'submit'}
              onClick={onButtonClick}
              disabled={busy || buttonDisabled}
              className="inline-flex items-center justify-center gap-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-black py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-brand-orange/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm cursor-pointer shrink-0"
            >
              {busy ? (
                <span className="inline-block w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                buttonLabel
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-brand-border bg-white overflow-hidden">
      <div className="px-5 py-4 bg-gradient-to-r from-brand-warm to-white border-b border-brand-border">
        <p className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Price breakdown</p>
      </div>
      <div className="px-5 py-4 space-y-2.5">
        <div className="flex justify-between text-sm">
          <span className="text-brand-grey">Base fare</span>
          <span className="font-medium text-brand-dark">SAR {fare.base.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-brand-grey">Service fee ({fare.serviceFeePercent}%)</span>
          <span className="font-medium text-brand-dark">SAR {fare.serviceFee.toFixed(2)}</span>
        </div>
        {vatAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-brand-grey">{vatLabel(fare.vatRate)}</span>
            <span className="font-medium text-brand-dark">SAR {vatAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex items-end justify-between pt-3 border-t border-brand-border">
          <div>
            <p className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Total</p>
            <p className="text-xs text-brand-grey mt-0.5">Fixed price · no surge</p>
          </div>
          <motion.span
            key={displayTotal}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-3xl font-black text-brand-orange tabular-nums"
          >
            SAR {displayTotal.toFixed(2)}
          </motion.span>
        </div>
      </div>
      {showButton && (
        <div className="px-5 pb-5">
          <button
            type={onButtonClick ? 'button' : 'submit'}
            onClick={onButtonClick}
            disabled={busy || buttonDisabled}
            className="w-full inline-flex items-center justify-center gap-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-black py-3.5 px-5 rounded-xl transition-all shadow-lg shadow-brand-orange/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm cursor-pointer"
          >
            {busy ? (
              <span className="inline-block w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              buttonLabel
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export function BookingStepIndicator({ steps, current }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const active = stepNum === current;
        const done = stepNum < current;
        return (
          <div key={label} className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-colors ${
                  done
                    ? 'bg-green-500 text-white'
                    : active
                      ? 'bg-brand-orange text-white shadow-md shadow-brand-orange/25'
                      : 'bg-brand-surface text-brand-grey border border-brand-border'
                }`}
              >
                {done ? '✓' : stepNum}
              </span>
              <span
                className={`text-xs font-bold truncate hidden sm:block ${
                  active ? 'text-brand-black' : 'text-brand-grey'
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 rounded-full ${done ? 'bg-green-400' : 'bg-brand-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FormSection({ icon: Icon, title, description, children }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="w-9 h-9 rounded-xl bg-brand-warm border border-brand-orange/20 text-brand-orange flex items-center justify-center shrink-0">
            <Icon size={18} />
          </span>
        )}
        <div className="min-w-0 pt-0.5">
          <h3 className="font-black text-brand-black text-sm">{title}</h3>
          {description && <p className="text-xs text-brand-grey mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="space-y-4 pl-0 sm:pl-12">{children}</div>
    </div>
  );
}

export function LocationHint({ active, lat, lng }) {
  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-green-700 font-medium mt-1.5 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1">
      <CircleDot size={12} />
      GPS location set ({lat.toFixed(4)}, {lng.toFixed(4)})
    </span>
  );
}

export function LegalConsentNote({ className = '' }) {
  return (
    <p className={`text-center text-[11px] text-brand-grey leading-relaxed ${className}`}>
      By continuing you agree to our{' '}
      <button
        type="button"
        onClick={() => openLegalModal('privacy')}
        className="text-brand-orange hover:underline font-medium cursor-pointer"
      >
        Privacy Policy
      </button>{' '}
      and{' '}
      <button
        type="button"
        onClick={() => openLegalModal('terms')}
        className="text-brand-orange hover:underline font-medium cursor-pointer"
      >
        Terms of Service
      </button>
      .
    </p>
  );
}

export function MapPinLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-brand-grey px-1 py-2">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-5 h-5 rounded-md bg-brand-orange text-white text-[10px] font-black flex items-center justify-center">H</span>
        Your location
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-5 h-5 rounded-md bg-brand-dark text-white text-[10px] font-black flex items-center justify-center">A</span>
        Airport
      </span>
    </div>
  );
}
