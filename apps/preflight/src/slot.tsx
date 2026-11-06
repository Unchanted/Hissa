import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './offers/frameSession.js';
import { SlotFrame } from './offers/SlotFrame.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SlotFrame />
  </StrictMode>,
);
