import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export default function BottomDrawer({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100]">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px] cursor-pointer"
            aria-label="Close"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="absolute bottom-0 left-0 right-0 max-h-[min(92dvh,780px)] flex flex-col rounded-t-3xl bg-white shadow-2xl shadow-black/15"
          >
            <div className="shrink-0 px-5 pt-3 pb-2 border-b border-brand-border/80">
              <div className="w-10 h-1 rounded-full bg-brand-border mx-auto mb-3" aria-hidden="true" />
              <div className="flex items-center justify-between gap-3">
                {title ? (
                  <h3 className="text-base font-black text-brand-dark">{title}</h3>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 -mr-1 rounded-xl text-brand-grey hover:text-brand-dark hover:bg-brand-surface transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
