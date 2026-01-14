import { useMemo, useState } from "react";
import Game from "./Banagrams/engine/Game";
import { LobbyGate, type LobbyChoice } from "./Banagrams/engine/LobbyGate";
import { LobbyWaitingRoom } from "./Banagrams/engine/LobbyWaitingRoom";
import { InstructionsPage } from "./Banagrams/engine/InstructionsPage";

type TabId = "home" | "blog" | "cv" | "banagrams";

type Tab = { id: TabId; label: string };

const TABS: Tab[] = [
  { id: "home", label: "Home" },
  { id: "blog", label: "Blog" },
  { id: "cv", label: "CV" },
  { id: "banagrams", label: "Banagrams" },
];

function TabButton({ tab, active, onClick }: { tab: Tab; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: active ? "#111827" : "white",
        color: active ? "white" : "#111827",
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      {tab.label}
    </button>
  );
}

function openBanagramsInNewTab() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "banagrams");
    url.searchParams.set("full", "1");
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  } catch {
    // fallback: still try to open current path
    window.open("?tab=banagrams&full=1", "_blank", "noopener,noreferrer");
  }
}

function openCvInNewTab() {
  window.open("/Elan%20Roth%20CV%20Jan%2026.pdf", "_blank", "noopener,noreferrer");
}

const initialNav = (() => {
  try {
    const url = new URL(window.location.href);
    const t = url.searchParams.get("tab");
    const full = url.searchParams.get("full") === "1";
    if (t === "home" || t === "blog" || t === "cv" || t === "banagrams") {
      return { tab: t as TabId, fullBanagrams: full && t === "banagrams" };
    }
  } catch {
    /* ignore */
  }
  return { tab: "home" as TabId, fullBanagrams: false };
})();

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>(initialNav.tab);
  const [fullBanagrams] = useState<boolean>(initialNav.fullBanagrams);
  const [choice, setChoice] = useState<LobbyChoice | null>(null);
  const [phase, setPhase] = useState<"waiting" | "game">("waiting");
  const [showInstructions, setShowInstructions] = useState(false);

  const tabTitle = useMemo(() => TABS.find((t) => t.id === activeTab)?.label ?? "" , [activeTab]);

  const banagramsView = (() => {
    if (showInstructions) return <InstructionsPage onClose={() => setShowInstructions(false)} />;
    if (!choice) return <LobbyGate onEnter={setChoice} onShowInstructions={() => setShowInstructions(true)} />;
    if (phase === "waiting") {
      return <LobbyWaitingRoom choice={choice} onShowInstructions={() => setShowInstructions(true)} onReady={() => setPhase("game")} />;
    }
    return <Game gameId={choice.gameId} playerId={choice.playerId} nickname={choice.nickname} />;
  })();

  if (fullBanagrams && activeTab === "banagrams") {
    return (
      <div style={{ minHeight: "100vh", background: "#f9fafb", color: "#111827", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        {banagramsView}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", color: "#111827", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(249,250,251,0.9)", backdropFilter: "blur(6px)", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 20 }}>Elan Roth</div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>{tabTitle}</div>
          </div>
          <nav style={{ display: "flex", gap: 8 }}>
            {TABS.map((tab) => (
              <TabButton
                key={tab.id}
                tab={tab}
                active={tab.id === activeTab}
                onClick={() => {
                  if (tab.id === "banagrams") {
                    openBanagramsInNewTab();
                    return;
                  }
                  if (tab.id === "cv") {
                    openCvInNewTab();
                    return;
                  }
                  setActiveTab(tab.id);
                }}
              />
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "18px 16px 32px" }}>
        {activeTab === "home" && (
          <section style={{ display: "grid", gap: 16, alignItems: "center", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <div>
              <h1 style={{ fontSize: 30, fontWeight: 900, marginBottom: 10 }}>Elan Roth</h1>
              <p style={{ color: "#4b5563", lineHeight: 1.6, marginBottom: 12 }}>
                Builder, writer, and game tinkerer. This is a lightweight hub for my work and Banagrams.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <TabButton tab={{ id: "blog", label: "Blog" }} active={false} onClick={() => setActiveTab("blog")} />
                <TabButton tab={{ id: "cv", label: "CV" }} active={false} onClick={openCvInNewTab} />
                <TabButton tab={{ id: "banagrams", label: "Banagrams" }} active={false} onClick={openBanagramsInNewTab} />
              </div>
            </div>
            <div style={{ justifySelf: "center" }}>
              <div style={{ width: 220, height: 220, borderRadius: "50%", overflow: "hidden", boxShadow: "0 14px 30px rgba(0,0,0,0.12)", border: "1px solid #e5e7eb" }}>
                <img
                  src="/images/Curr.JPG"
                  alt="Elan Roth"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  loading="lazy"
                />
              </div>
            </div>
          </section>
        )}

        {activeTab === "blog" && (
          <section>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Blog</h1>
            <p style={{ color: "#4b5563", lineHeight: 1.5 }}>
              Posts coming soon. For now, this is a placeholder for lightweight writing.
            </p>
          </section>
        )}

        {activeTab === "cv" && (
          <section>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>CV</h1>
            <p style={{ color: "#4b5563", lineHeight: 1.5 }}>
              Drop a PDF link here or add bullet highlights. This keeps the site light without extra UI.
            </p>
          </section>
        )}

        {activeTab === "banagrams" && (
          <section>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Banagrams</h1>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "white", boxShadow: "0 8px 24px rgba(0,0,0,0.04)" }}>
              {banagramsView}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
