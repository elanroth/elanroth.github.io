import React from "react";

export function InstructionsPage({ onClose }: { onClose: () => void }) {
  const sections: { title: string; items: string[] }[] = [
    {
      title: "Core controls",
      items: [
        "Peel: Press Space when your rack is empty and your board is valid.",
        "Dump: Select a tile (or marquee-select multiple) and tap the Dump control when the bag has 3+ tiles.",
        "Center board: Press C (or tap the Center Board button).",
        "Move tiles: Click-drag tiles; marquee-drag on empty space to multi-select; tap to select on mobile.",
      ],
    },
    {
      title: "Board rules",
      items: [
        "Tiles snap to the grid; words must be contiguous and valid per the dictionary and min length option.",
        "Peel is blocked if your rack isn\'t empty or the board is invalid.",
        "Board auto-zooms out and re-centers as you approach the edges.",
      ],
    },
    {
      title: "Lobby flow",
      items: [
        "Host creates a lobby and clicks Start when ready; others wait in the room.",
        "You can view instructions from the lobby gate or waiting room.",
      ],
    },
    {
      title: "Spectating",
      items: [
        "Use the dropdown + See Other Board to view another player; you can\'t move their tiles.",
        "Return to your board with the same button.",
      ],
    },
    {
      title: "Tips",
      items: [
        "If peel is blocked, place all tiles and ensure all words are valid.",
        "If tiles shrink, that\'s auto-fit making room near the edges.",
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
