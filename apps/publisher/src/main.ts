import { mountPreflightSlot } from './mount-slot.js';

const env = import.meta.env as Record<string, string | undefined>;
const preflightOrigin = env.VITE_PREFLIGHT_ORIGIN ?? 'http://localhost:5173';

const slot = document.getElementById('sidebar-slot')!;
const status = document.getElementById('slot-status')!;

mountPreflightSlot(slot, { publisherId: 'demo', slotId: 'sidebar', context: 'defi-dashboard', preflightOrigin }).ready.then(() => {
  status.textContent = 'Slot ready (frame sent READY only)';
});
