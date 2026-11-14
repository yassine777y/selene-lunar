/**
 * mission-state.js — the reducer that owns every piece of mission state.
 * Pure and framework-free so `tests/design.test.js` can prove the analysis
 * window is always derived from the landing date + duration.
 */
import { EPOCH_MS, MS_DAY } from './astro.js';

export const DEFAULT_DAYS = 30;
export const DEFAULT_DATE = EPOCH_MS + 6 * MS_DAY; // 9 Jan 2026 — mid-window, illuminated
export const MIN_DATE = Date.UTC(2026, 0, 1);
export const MAX_DATE = Date.UTC(2027, 0, 1);

export const initialState = {
  tab: 'explorer',
  siteId: 'connecting-ridge',
  landingMs: DEFAULT_DATE,
  cursorMs: DEFAULT_DATE,
  days: DEFAULT_DAYS,
  playing: false,
  speed: 6, // simulated hours per real second while playing
  drawerOpen: false,
  modal: null,
  toast: '',
};

export function reducer(state, action) {
  switch (action.type) {
    case 'tab':
      return { ...state, tab: action.value, drawerOpen: false };
    case 'site':
      return { ...state, siteId: action.value };
    case 'landing': {
      const landingMs = Math.min(MAX_DATE, Math.max(MIN_DATE, action.value));
      return { ...state, landingMs, cursorMs: landingMs, playing: false };
    }
    case 'days': {
      const days = action.value;
      const cursorMs = Math.max(state.landingMs, Math.min(state.landingMs + days * MS_DAY, state.cursorMs));
      return { ...state, days, cursorMs, playing: false };
    }
    case 'cursor': // user scrub: stop playback
      return { ...state, cursorMs: action.value, playing: false };
    case 'tick': // playback frame: keep playing
      return { ...state, cursorMs: action.value };
    case 'step': {
      const next = state.cursorMs + action.value * MS_DAY;
      return {
        ...state,
        playing: false,
        cursorMs: Math.max(state.landingMs, Math.min(state.landingMs + state.days * MS_DAY, next)),
      };
    }
    case 'play':
      return { ...state, playing: action.value ?? !state.playing };
    case 'speed':
      return { ...state, speed: action.value };
    case 'drawer':
      return { ...state, drawerOpen: action.value ?? !state.drawerOpen };
    case 'modal':
      return { ...state, modal: action.value };
    case 'toast':
      return { ...state, toast: action.value };
    default:
      return state;
  }
}


/**
 * The ONE definition of the analysis window used by every page, chart and the
 * 3D scene. Nothing else is allowed to compute its own end date.
 */
export const analysisWindowOf = (state) => ({
  startMs: state.landingMs,
  endMs: state.landingMs + state.days * MS_DAY,
  days: state.days,
});
