import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/barlow-condensed/600.css';
import './offers/frameSession.js';
import { SlotFrame } from './offers/SlotFrame.js';
import './offers/slot.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SlotFrame />
  </StrictMode>,
);
