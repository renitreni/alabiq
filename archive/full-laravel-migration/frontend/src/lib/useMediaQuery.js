import { useState, useEffect } from 'react';

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false),
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (event) => setMatches(event.matches);
    mq.addEventListener('change', handler);
    setMatches(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

export function useIsMobile() {
  return useMediaQuery('(max-width: 767px)');
}

// Use drawer-style pickers on tablets and narrow laptops where anchored popovers clip or misalign.
export function usePickerDrawer() {
  return useMediaQuery('(max-width: 1023px)');
}
