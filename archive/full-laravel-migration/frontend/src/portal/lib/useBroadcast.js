// ---------------------------------------------------------------------
// Subscribe to a live event stream relayed by the Alabiq API.
//
//   useBroadcast('booking-SM-XXXX', {
//     status: (payload) => { ... },
//   }, enabled)
//
// Handlers are read from a ref so re-renders don't tear down the channel.
// Returns a `connected` flag the UI can use to fall back to polling.
// ---------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { API_BASE } from './api';
import { getSessionToken } from './sessionStore';

export function useBroadcast(channelName, events, enabled = true) {
  const eventsRef = useRef(events);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    if (!enabled || !channelName) {
      return undefined;
    }
    const controller = new AbortController();
    let retry;
    let stopped = false;

    async function connect() {
      try {
        const token = getSessionToken();
        const response = await fetch(`${API_BASE}/api/events?topic=${encodeURIComponent(channelName)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error('event stream unavailable');
        setConnected(true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';
          for (const frame of frames) {
            const line = frame.split('\n').find((part) => part.startsWith('data: '));
            if (!line) continue;
            try {
              const message = JSON.parse(line.slice(6));
              const fn = eventsRef.current?.[message.event];
              if (typeof fn === 'function') fn(message.payload);
            } catch { /* connected frame or malformed event */ }
          }
        }
        if (!stopped) setConnected(false);
      } catch (err) {
        if (err.name !== 'AbortError') setConnected(false);
      }
      if (!stopped) retry = setTimeout(connect, 3000);
    }
    connect();

    return () => {
      stopped = true;
      clearTimeout(retry);
      controller.abort();
      setConnected(false);
    };
  }, [channelName, enabled]);

  return connected;
}
