import React from "react";

export function InstructionsPage({ onClose }: { onClose: () => void }) {
  const sections: { title: string; items: string[] }[] = [
    {
      title: "Core play",
      items: [
        "Typing is the default: move the cursor with arrows, type letters to place from your rack, Backspace/Delete to pull back.",
        "Drag-and-drop also works: drag tiles from rack to grid; drag on empty space to marquee-select and move groups.",
        "Double-click your own board tile to send it back to the rack; shuffle with the button or Enter (when 2+ tiles).",
      ],
    },
    {
      title: "Typing mode",
      items: [
        "Toggle Typing mode in the header. Arrow keys move the cursor; Tab flips direction (right/down).",
        "Type letters to place matching rack tiles; Backspace/Delete pulls the tile at or just behind the cursor back to your rack.",
        "Typing mode is disabled while spectating or after the game ends.",
      ],
    },
    {
      title: "Peel & win",
      items: [
        "Peel (Space or the Peel button) when your rack is empty and your board is valid per the dictionary and min-length option.",
        "When the bag has fewer tiles than players, the next Peel becomes Bananas! and ends the game.",
      ],
    },
    {
      title: "Dump & swaps",
      items: [
        "Drag any rack tile into the red Dump box to trade it in; that letter goes back to the bag and you draw up to three random replacements while supplies last.",
        "Dump is single-tile; if the bag is low you may get fewer than three tiles back.",
      ],
    },
    {
      title: "Spectating & view",
      items: [
        "Pick a player in the dropdown, then click See Other Board; click Return to Your Board to resume playing.",
        "While spectating you can't move tiles or type; typing mode auto-disables.",
        "Use Center Board to recentre; the board also auto-zooms/recenters when you build near the edges.",
      ],
    },
    {
      title: "Troubleshooting",
      items: [
        "If Peel is blocked, place every rack tile and fix invalid words (red tiles).",
        "If tiles shrink, auto-fit is making space; Center Board to reset your view.",
      ],
    },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(180deg,#fff8e1 0%, #fff3bf 60%, #fffbe6 100%)", fontFamily: "'Fredoka', system-ui, sans-serif" }}>
      <div style={{ width: "min(920px, 96vw)", background: "rgba(255,255,255,0.94)", padding: 24, borderRadius: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22 }}>How to Play</div>
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

        <div style={{ display: "grid", gap: 12 }}>
          {sections.map((section) => (
            <div key={section.title} style={{ padding: 14, borderRadius: 12, background: "linear-gradient(180deg,#fffef9,#fff7d6)", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{section.title}</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: "#374151", lineHeight: 1.5 }}>
                {section.items.map((item, idx) => (
                  <li key={idx} style={{ marginBottom: 4 }}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
