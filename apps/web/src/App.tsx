import { Cosmos } from "./components/Cosmos";
import { DemoGuide, Nav, useRoute } from "./components/Shell";
import { StoreProvider } from "./store";
import { LiveProvider } from "./live";
import { Landing } from "./views/Landing";
import { Seller } from "./views/Seller";
import { Agent } from "./views/Agent";
import { Ledger } from "./views/Ledger";

export default function App() {
  const route = useRoute();
  return (
    <LiveProvider>
    <StoreProvider>
      <Cosmos variant={route === "" ? "hero" : "app"} />
      <div className="vignette" aria-hidden />
      <Nav route={route} />
      <main key={route} className={`route${route ? " app" : ""}`}>
        {route === "" && <Landing />}
        {route === "seller" && <Seller />}
        {route === "agent" && <Agent />}
        {route === "ledger" && <Ledger />}
      </main>
      {route !== "" && <DemoGuide route={route} />}
    </StoreProvider>
    </LiveProvider>
  );
}
