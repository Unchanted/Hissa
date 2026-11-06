import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/barlow-condensed/600.css';
import { Handoff } from './offers/Handoff.js';
import './hygiene/app.css';
import './offers/handoff.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Handoff />
  </StrictMode>,
);
