import React from "react";

export function InstructionsPage({ onClose }: { onClose: () => void }) {
  const quickSteps = [
    "Build words on your grid.",
    "Use every rack tile.",
    "Hit Peel to draw new tiles.",
    "First to empty rack wins (Bananas!).",
  ];

  const playModes = [
    { title: "Drag", body: "Drag tiles to the grid; drag empty space to marquee-move groups." },
    { title: "Type", body: "Toggle Typing mode, click a square, type letters to place tiles." },
    { title: "Fix", body: "Double-click a board tile to return it to your rack." },
  ];

  const powerButtons = [
    { title: "Peel", body: "Use when your rack is empty and your board is valid." },
    { title: "Dump", body: "Drop one rack tile in the red box to trade it." },
    { title: "Center/Zoom", body: "Center the board or pinch/+/− to zoom." },
    { title: "Spectate", body: "See other boards; you cannot move tiles while watching." },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(180deg,#fff8e1 0%, #fff3bf 60%, #fffbe6 100%)", fontFamily: "'Fredoka', system-ui, sans-serif" }}>
      <div style={{ width: "min(920px, 96vw)", background: "rgba(255,255,255,0.94)", padding: 24, borderRadius: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22 }}>Banagrams: Quick Start</div>
            <div style={{ color: "#6b7280", fontWeight: 600, marginTop: 2 }}>Fast rules, no fluff.</div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "10px 12px",
              background: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: 12,
              fontWeight: 800,
              boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
              cursor: "pointer",
            }}
          >
            Back
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 14 }}>
          <div style={{ padding: 16, borderRadius: 14, background: "linear-gradient(180deg,#fffef9,#fff7d6)", boxShadow: "0 6px 16px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 900, marginBottom: 10, fontSize: 16 }}>How to win</div>
            <ol style={{ margin: 0, paddingLeft: 18, color: "#374151", lineHeight: 1.6 }}>
              {quickSteps.map((item) => (
                <li key={item} style={{ marginBottom: 6 }}>{item}</li>
              ))}
            </ol>
          </div>
          <div style={{ padding: 16, borderRadius: 14, background: "linear-gradient(180deg,#fffef9,#fff7d6)", boxShadow: "0 6px 16px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 900, marginBottom: 10, fontSize: 16 }}>Good to know</div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ background: "#fff", borderRadius: 10, padding: "8px 10px", fontWeight: 700, color: "#374151" }}>Red tiles = invalid words</div>
              <div style={{ background: "#fff", borderRadius: 10, padding: "8px 10px", fontWeight: 700, color: "#374151" }}>Tiles shrink if board grows</div>
              <div style={{ background: "#fff", borderRadius: 10, padding: "8px 10px", fontWeight: 700, color: "#374151" }}>Center Board recenters view</div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {playModes.map((mode) => (
            <div key={mode.title} style={{ padding: 12, borderRadius: 12, background: "white", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", border: "1px solid #f3e7bf" }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>{mode.title}</div>
              <div style={{ color: "#374151", lineHeight: 1.45 }}>{mode.body}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {powerButtons.map((btn) => (
            <div key={btn.title} style={{ padding: 12, borderRadius: 12, background: "#fff8e8", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", border: "1px solid #f3e7bf" }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>{btn.title}</div>
              <div style={{ color: "#374151", lineHeight: 1.45 }}>{btn.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
