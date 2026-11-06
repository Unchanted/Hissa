import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function Handoff() {
  return (
    <main>
      <h1>Preflight offer preferences</h1>
      <p>Topic approval and personalization consent will be set here.</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Handoff />
  </StrictMode>,
);
