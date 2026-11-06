export function App() {
  return (
    <main>
      <h1>Preflight</h1>
      <p>Checks a confirmed plan against current allowances before money moves.</p>
      <p data-testid="origin">Origin: {window.location.origin}</p>
    </main>
  );
}
