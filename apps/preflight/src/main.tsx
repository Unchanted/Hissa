import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './hygiene/App.js';
import './hygiene/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
