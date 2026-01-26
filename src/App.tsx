import { useEffect, useMemo, useState } from "react";
import Game from "./Banagrams/engine/Game";
import { LobbyGate, type LobbyChoice } from "./Banagrams/engine/LobbyGate";
import { LobbyWaitingRoom } from "./Banagrams/engine/LobbyWaitingRoom";
import { InstructionsPage } from "./Banagrams/engine/InstructionsPage";
import { SEQNC } from "./canadian/GreatWhiteNorth";
import { AnagramsVisualizer } from "./Anagrams/game";
import { AnagramsLobbyGate, type AnagramsLobbyChoice } from "./Anagrams/LobbyGate";

type TabId = "home" | "education" | "experience" | "talks" | "cv" | "anagrams" | "banagrams" | "seqnc";
type Tab = { id: TabId; label: string };
type LinkItem = { label: string; url: string };
type CurrentProject = { title: string; description: string; links?: LinkItem[] };
type ExperienceItem = { title: string; meta: string; summary: string; links?: LinkItem[] };
type ExperienceSection = { title: string; items: ExperienceItem[] };

const TABS: Tab[] = [
  { id: "home", label: "Home" },
  { id: "education", label: "Education" },
  { id: "experience", label: "Experience" },
  { id: "talks", label: "Talks" },
  { id: "cv", label: "CV" },
  { id: "anagrams", label: "Anagrams" },
  { id: "banagrams", label: "Banagrams" },
  { id: "seqnc", label: "SEQNC" },
];

const educationItems = [
  {
    school: "University of Pennsylvania",
    location: "Philadelphia, PA",
    dates: "Aug 2021 – May 2025",
    detail: "B.A. in Logic, Information, and Computation",
    sub: "Minors: Computer Science, Mathematics, Religious Studies",
    honors: [
      "Phi Beta Kappa",
      "Summa Cum Laude",
      "Interfaith Dialogue Club (President 2022–2023)",
      "Putnam Exam score: 13 (2023)",
    ],
  },
  {
    school: "Budapest Semester in Mathematics",
    location: "Budapest, Hungary",
    dates: "Jan 2024 – May 2024",
    detail: "Research on unit distance graph realization with the Rényi Institute",
  },
  {
    school: "Shalom Hartman Institute",
    location: "Jerusalem, Israel",
    dates: "Aug 2020 – May 2021",
    detail: "Hevruta Program",
    sub: "Dialogue on religious philosophy and pluralism with 35 American and 35 Israeli students",
  },
  {
    school: "The Leffell School",
    location: "Hartsdale, NY",
    dates: "Sep 2018 – May 2020",
    detail: "High School Diploma",
    sub: "AIME Qualifier (2020); Founder and President of the Aesthetic Graphing Club",
  },
];

const coursework = {
  mathematicsPenn: [
    "Calculus II",
    "Calculus III",
    "Abstract Algebra I",
    "Abstract Algebra II",
    "Logic and Computability I",
    "Logic and Computability II",
    "Topics in Computability Theory",
    "Graduate Analysis",
    "Supervised Study in Computability Theory",
    "Supervised Study in Lean Formalization of Computability",
    "Independent Study in Model Theory",
    "Independent Study in Game Theory",
  ],
  mathematicsBsm: [
    "Research in AI and Unit Distance Graphs",
    "Conjecture and Proof",
    "Advanced Combinatorics",
  ],
  computerScience: [
    "Programming Languages and Techniques I",
    "Programming Languages and Techniques II",
    "Mathematical Foundations of Computer Science",
    "Automata, Computability, and Complexity",
    "Data Structures and Algorithms",
    "Independent Study in Homotopy Type Theory",
  ],
};

const experienceSections: ExperienceSection[] = [
  {
    title: "Research",
    items: [
      {
        title: "Fulbright Student Program · University of Waterloo",
        meta: "Ontario, Canada · Sep 2025 – Present",
        summary: "Fulbright Visiting Researcher in Pure Mathematics. Working with Dr. Barbara Csima on computable structure theory, optimal bounds for Scott complexity of reduced abelian p-groups, and presenting research in algorithmic information theory.",
      },
      {
        title: "University of Pennsylvania",
        meta: "Philadelphia, PA · May 2024 – Aug 2024",
        summary: "Programming Languages Research Assistant to Dr. Steve Zdancewic. Developed a denotational semantics for IMP, extended toward the untyped lambda calculus, and formally verified PL properties using Coq.",
      },
    ],
  },
  {
    title: "Open Source",
    items: [
      {
        title: "mathlib",
        meta: "Lean 4",
        summary: "Formalized core definitions and results on Turing degrees and reducibility; built infrastructure for computability-theoretic constructions.",
        links: [
          { label: "Source", url: "https://github.com/leanprover-community/mathlib4/blob/master/Mathlib/Computability/TuringDegree.lean" },
        ],
      },
      {
        title: "Compfiles",
        meta: "Lean 4",
        summary: "Formalized a full USAMO problem, including statement and proof.",
        links: [
          { label: "Problem", url: "https://github.com/dwrensha/compfiles/blob/main/Compfiles/Usa2017P1.lean" },
        ],
      },
      {
        title: "In progress",
        meta: "Lean 4",
        summary: "Lean formalization of Kolmogorov complexity and algorithmic randomness.",
        links: [
          { label: "Source", url: "https://github.com/elanroth/cslib/tree/main/Cslib/Computability/KolmogorovComplexity" },
        ],
      },
    ],
  },
  {
    title: "Teaching",
    items: [
      {
        title: "University of Pennsylvania",
        meta: "Philadelphia, PA · Aug 2024 – May 2025",
        summary: "Teaching Assistant, CIS 500: Software Foundations. Held office hours for graduate students and wrote, administered, and graded exams.",
      },
      {
        title: "University of Pennsylvania",
        meta: "Philadelphia, PA · Aug 2022 – May 2025",
        summary: "Teaching Assistant, CIS 120: Programming Languages and Techniques. Taught weekly recitations and held office hours for large-enrollment courses.",
      },
    ],
  },
  {
    title: "Analytics",
    items: [
      {
        title: "Wharton Moneyball Academy",
        meta: "Philadelphia, PA · Summer 2022 & Summer 2023",
        summary: "Head Teaching and Research Assistant. Built baseball models using MCMC, managed teaching assistants and students, and taught statistical modeling in R.",
      },
      {
        title: "Philadelphia Union",
        meta: "Philadelphia, PA · Aug 2022 – Aug 2023",
        summary: "Data Analyst. Built player/ball tracking visualizations and models for performance evaluation and decision-making.",
      },
    ],
  },
];

const talks = [
  {
    title: "A series of four talks on Random Binary Sequences, Computability Learning Seminar, University of Waterloo (Oct–Nov 2025)",
    links: [
      { label: "First", url: "https://uwaterloo.ca/pure-mathematics/events/computability-learning-seminar-157" },
      { label: "Second", url: "https://uwaterloo.ca/pure-mathematics/events/computability-learning-seminar-158" },
      { label: "Third", url: "https://uwaterloo.ca/pure-mathematics/events/computability-learning-seminar-159" },
      { label: "Fourth", url: "https://uwaterloo.ca/pure-mathematics/events/computability-learning-seminar-160" },
    ],
  },
  {
    title: "Formalizing Turing Degrees in Lean, Logic Seminar, University of Waterloo (Sep 2025)",
    links: [
      { label: "Abstract", url: "https://uwaterloo.ca/pure-mathematics/events/logic-seminar-77" },
    ],
  },
  {
    title: "Too HoTT to Handle: The Importance of Homotopy Type Theory, Logic Seminar, University of Pennsylvania (May 2025)",
  },
  {
    title: "AI and Unit Distance Graphs, Joint Mathematics Meetings, Seattle (Jan 2025)",
    links: [
      { label: "Abstract", url: "https://meetings.ams.org/math/jmm2025/meetingapp.cgi/Paper/41126" },
    ],
  },
  {
    title: "Developing a Mechanized Denotational Semantics for IMP, University of Pennsylvania Research Expositions (Aug–Sep 2024)",
  },
  {
    title: "Shapley Values and Game-Theoretic Evaluation of Escape Rooms, Directed Reading Program, University of Pennsylvania (Dec 2023)",
    links: [
      { label: "Abstract", url: "https://web.sas.upenn.edu/math-drp/fall-2023-projects/" },
      { label: "Slides", url: "/DRP%20Game%20Theory.pptx" },
    ],
  },
  {
    title: "Model Theory: Categoricity, Completeness, and Algebraically Closed Fields, Directed Reading Program, University of Pennsylvania (May 2023)",
    links: [
      { label: "Abstract", url: "https://web.sas.upenn.edu/math-drp/spring-2023-projects/" },
      { label: "Slides", url: "https://bpb-us-w2.wpmucdn.com/web.sas.upenn.edu/dist/e/952/files/2023/08/Elan-Final-Presentation.pdf" },
    ],
  },
];

const currentProjects: CurrentProject[] = [
  {
    title: "Optimal Scott Sentences of Reduced Abelian p-Groups",
    description: "Working with Dr. Barbara Csima to characterize the Scott complexity of specific groups",
  },
  {
    title: "Uniform Complexity of Ω-Number Inversion Constructions",
    description: "Investigating non-uniformity in realizing the correspondence between random left-c.e. reals and halting probabilities of optimal machines.",
  },
  {
    title: "Formalizing Kolmogorov Complexity and Algorithmic Randomness",
    description: "Using Lean to formalize these notions for the mathlib and cslib libraries",
  },
  {
    title: "Formalizing Turing Degrees",
    description: "Working with Tanner Duve to contribute to the to mathlib libary by formally defining Turing reducibility",
  },
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

function openSeqncInNewTab() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "seqnc");
    url.searchParams.set("full", "1");
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  } catch {
    window.open("?tab=seqnc&full=1", "_blank", "noopener,noreferrer");
  }
}

function openAnagramsInNewTab() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "anagrams");
    url.searchParams.set("full", "1");
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  } catch {
    window.open("?tab=anagrams&full=1", "_blank", "noopener,noreferrer");
  }
}

const initialNav = (() => {
  try {
    const url = new URL(window.location.href);
    const t = url.searchParams.get("tab");
    const full = url.searchParams.get("full") === "1";
    if (t === "home" || t === "education" || t === "experience" || t === "talks" || t === "cv" || t === "anagrams" || t === "banagrams" || t === "seqnc") {
      return {
        tab: t as TabId,
        fullBanagrams: full && t === "banagrams",
        fullSeqnc: full && t === "seqnc",
        fullAnagrams: full && t === "anagrams",
      };
    }
  } catch {
    /* ignore */
  }
  return { tab: "home" as TabId, fullBanagrams: false, fullSeqnc: false, fullAnagrams: false };
})();

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>(initialNav.tab);
  const [fullBanagrams] = useState<boolean>(initialNav.fullBanagrams);
  const [fullSeqnc] = useState<boolean>(initialNav.fullSeqnc);
  const [fullAnagrams] = useState<boolean>(initialNav.fullAnagrams);
  const [choice, setChoice] = useState<LobbyChoice | null>(null);
  const [anagramsChoice, setAnagramsChoice] = useState<AnagramsLobbyChoice | null>(null);
  const [phase, setPhase] = useState<"waiting" | "game">("waiting");
  const [showInstructions, setShowInstructions] = useState(false);

  const tabTitle = useMemo(() => TABS.find((t) => t.id === activeTab)?.label ?? "", [activeTab]);

  useEffect(() => {
    if (choice?.skipWaiting) {
      setPhase("game");
    }
  }, [choice]);

  const banagramsView = (() => {
    if (showInstructions) return <InstructionsPage onClose={() => setShowInstructions(false)} />;
    if (!choice) return <LobbyGate onEnter={setChoice} onShowInstructions={() => setShowInstructions(true)} />;
    if (phase === "waiting") {
      return (
        <LobbyWaitingRoom
          choice={choice}
          onShowInstructions={() => setShowInstructions(true)}
          onReady={() => setPhase("game")}
          onExit={() => {
            setChoice(null);
            setPhase("waiting");
          }}
        />
      );
    }
      return (
        <Game
          gameId={choice.gameId}
          playerId={choice.playerId}
          nickname={choice.nickname}
          onExitToLobby={(next) => {
            setChoice({ gameId: next.gameId, playerId: next.playerId, nickname: next.nickname });
            setPhase("waiting");
          }}
        />
      );
  })();

  if (fullBanagrams && activeTab === "banagrams") {
    return (
      <div style={{ minHeight: "100vh", background: "#f9fafb", color: "#111827", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        {banagramsView}
      </div>
    );
  }

  if (fullSeqnc && activeTab === "seqnc") {
    return (
      <div style={{ minHeight: "100vh", background: "#f9fafb", color: "#111827", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <SEQNC />
      </div>
    );
  }

  if (fullAnagrams && activeTab === "anagrams") {
    return (
      <div style={{ minHeight: "100vh", background: "#f9fafb", color: "#111827", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <main style={{ width: "100%", padding: "24px" }}>
          {anagramsChoice ? (
            <AnagramsVisualizer choice={anagramsChoice} />
          ) : (
            <AnagramsLobbyGate onEnter={setAnagramsChoice} />
          )}
        </main>
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
                  if (tab.id === "anagrams") {
                    openAnagramsInNewTab();
                    return;
                  }
                  if (tab.id === "banagrams") {
                    openBanagramsInNewTab();
                    return;
                  }
                  if (tab.id === "cv") {
                    openCvInNewTab();
                    return;
                  }
                  if (tab.id === "seqnc") {
                    openSeqncInNewTab();
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
          <section style={{ display: "grid", gap: 24 }}>
            <div style={{ display: "grid", gap: 16, alignItems: "center", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              <div>
                  <h1 style={{ fontSize: 30, fontWeight: 900, marginBottom: 10 }}>About Me</h1>
                <p style={{ color: "#4b5563", lineHeight: 1.6, marginBottom: 12 }}>
                  Currently researching mathematical logic at the University of Waterloo with Dr. Barbara Csima on a Fulbright Scholarship.
                  I am most interested in computability theory and type theory, especially working with formal proof assistants such as Lean and Rocq.
                </p>
              </div>
              <div style={{ justifySelf: "center" }}>
                <div style={{ width: 260, height: 320, borderRadius: 18, overflow: "hidden", boxShadow: "0 14px 30px rgba(0,0,0,0.12)", border: "1px solid #e5e7eb" }}>
                  <img
                    src="/images/WhoDunIt.jpg"
                    alt="Elan Roth"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    loading="lazy"
                  />
                </div>
              </div>
            </div>

            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>Current Projects</h2>
              <div style={{ display: "grid", gap: 12 }}>
                {currentProjects.map((project) => (
                  <div key={project.title} style={{ padding: 16, borderRadius: 12, border: "1px solid #e5e7eb", background: "white", boxShadow: "0 8px 18px rgba(0,0,0,0.04)" }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{project.title}</h3>
                    <p style={{ color: "#4b5563", lineHeight: 1.5 }}>{project.description}</p>
                    {project.links && (
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                        {project.links.map((link) => (
                          <a
                            key={link.url}
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              padding: "6px 10px",
                              borderRadius: 999,
                              border: "1px solid #e5e7eb",
                              background: "#f8fafc",
                              fontWeight: 700,
                              color: "#1d4ed8",
                              textDecoration: "none",
                            }}
                          >
                            {link.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === "education" && (
          <section style={{ display: "grid", gap: 20 }}>
            <div>
              <div style={{ display: "grid", gap: 12 }}>
                {educationItems.map((item) => (
                  <div key={item.school} style={{ padding: 16, borderRadius: 12, border: "1px solid #e5e7eb", background: "white", boxShadow: "0 8px 18px rgba(0,0,0,0.04)" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "baseline" }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: "#111827" }}>{item.school}</div>
                        <div style={{ color: "#6b7280", fontSize: 13, fontWeight: 600 }}>{item.location}</div>
                      </div>
                      <div style={{ color: "#6b7280", fontSize: 13, fontWeight: 700 }}>{item.dates}</div>
                    </div>
                    <div style={{ marginTop: 8, color: "#374151", fontWeight: 700, fontSize: 14 }}>{item.detail}</div>
                    {item.sub && <div style={{ color: "#4b5563", marginTop: 4, fontSize: 14 }}>{item.sub}</div>}
                    {item.honors && item.honors.length > 0 && (
                      <ul style={{ marginTop: 8, paddingLeft: 18, color: "#4b5563", lineHeight: 1.5, fontSize: 14 }}>
                        {item.honors.map((honor) => (
                          <li key={`${item.school}-${honor}`}>{honor}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>Relevant Coursework</h2>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ padding: 16, borderRadius: 12, border: "1px solid #e5e7eb", background: "white", boxShadow: "0 8px 18px rgba(0,0,0,0.04)" }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Mathematics (University of Pennsylvania)</div>
                  <div style={{ color: "#4b5563", lineHeight: 1.6 }}>{coursework.mathematicsPenn.join(" · ")}</div>
                </div>
                <div style={{ padding: 16, borderRadius: 12, border: "1px solid #e5e7eb", background: "white", boxShadow: "0 8px 18px rgba(0,0,0,0.04)" }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Mathematics (Budapest Semester in Mathematics)</div>
                  <div style={{ color: "#4b5563", lineHeight: 1.6 }}>{coursework.mathematicsBsm.join(" · ")}</div>
                </div>
                <div style={{ padding: 16, borderRadius: 12, border: "1px solid #e5e7eb", background: "white", boxShadow: "0 8px 18px rgba(0,0,0,0.04)" }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Computer Science (University of Pennsylvania)</div>
                  <div style={{ color: "#4b5563", lineHeight: 1.6 }}>{coursework.computerScience.join(" · ")}</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "experience" && (
          <section style={{ display: "grid", gap: 20 }}>
            {experienceSections.map((section) => (
              <div key={section.title} style={{ display: "grid", gap: 12 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800 }}>{section.title}</h2>
                <div style={{ display: "grid", gap: 12 }}>
                  {section.items.map((item) => (
                    <div key={`${section.title}-${item.title}`} style={{ padding: 16, borderRadius: 12, border: "1px solid #e5e7eb", background: "white", boxShadow: "0 8px 18px rgba(0,0,0,0.04)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 800 }}>{item.title}</div>
                        {item.meta && <div style={{ color: "#6b7280", fontSize: 13, fontWeight: 700 }}>{item.meta}</div>}
                      </div>
                      <p style={{ color: "#4b5563", lineHeight: 1.6, marginTop: 6 }}>{item.summary}</p>
                      {item.links && (
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                          {item.links.map((link) => (
                            <a
                              key={link.url}
                              href={link.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                padding: "6px 10px",
                                borderRadius: 999,
                                border: "1px solid #e5e7eb",
                                background: "#f8fafc",
                                fontWeight: 700,
                                color: "#1d4ed8",
                                textDecoration: "none",
                              }}
                            >
                              {link.label}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {activeTab === "talks" && (
          <section>
            <div style={{ display: "grid", gap: 12 }}>
              {talks.map((talk) => (
                <div key={talk.title} style={{ padding: 16, borderRadius: 12, border: "1px solid #e5e7eb", background: "white", boxShadow: "0 8px 18px rgba(0,0,0,0.04)", color: "#4b5563", lineHeight: 1.6, display: "grid", gap: 8 }}>
                  <div>{talk.title}</div>
                  {talk.links && (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {talk.links.map((link) => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid #e5e7eb",
                            background: "#f8fafc",
                            fontWeight: 700,
                            color: "#1d4ed8",
                            textDecoration: "none",
                          }}
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === "cv" && (
          <section>
            <p style={{ color: "#4b5563", lineHeight: 1.5 }}>
              Drop a PDF link here or add bullet highlights. This keeps the site light without extra UI.
            </p>
          </section>
        )}

        {activeTab === "anagrams" && (
          <section>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, background: "white", boxShadow: "0 8px 24px rgba(0,0,0,0.04)" }}>
              {anagramsChoice ? (
                <AnagramsVisualizer choice={anagramsChoice} />
              ) : (
                <AnagramsLobbyGate onEnter={setAnagramsChoice} />
              )}
            </div>
          </section>
        )}

        {activeTab === "seqnc" && (
          <section>
            <SEQNC />
          </section>
        )}

        {activeTab === "banagrams" && (
          <section>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "white", boxShadow: "0 8px 24px rgba(0,0,0,0.04)" }}>
              {banagramsView}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
