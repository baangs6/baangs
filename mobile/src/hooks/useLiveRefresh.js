import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { subscribe } from '../utils/appEvents';

// Refresh only the visible screen; serialize requests and pause while backgrounded.
export default function useLiveRefresh(loader, key = '', intervalMs = 30000) {
  const focused = useIsFocused();
  const latest = useRef(loader);
  latest.current = loader;
  useEffect(() => {
    if (!focused) return undefined;
    let disposed = false;
    let running = false;
    let pending = false;
    const refresh = async () => {
      if (disposed || AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
      if (running) { pending = true; return; }
      running = true;
      try { await latest.current(() => !disposed); } catch (error) { console.warn('Refresh failed', error.message); }
      finally {
        running = false;
        if (pending && !disposed) { pending = false; refresh(); }
      }
    };
    refresh();
    const timer = setInterval(refresh, intervalMs);
    const appState = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const unsubscribe = subscribe('dataChanged', refresh);
    return () => { disposed = true; clearInterval(timer); appState.remove(); unsubscribe(); };
  }, [focused, key, intervalMs]);
}
