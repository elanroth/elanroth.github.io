import { useEffect, useMemo, useState } from "react";
import Game from "./Banagrams/engine/Game";
import { LobbyGate, type LobbyChoice } from "./Banagrams/engine/LobbyGate";
import { LobbyWaitingRoom } from "./Banagrams/engine/LobbyWaitingRoom";
import { InstructionsPage } from "./Banagrams/engine/InstructionsPage";
import { SEQNC } from "./SEQNC/GreatWhiteNorth";
import { AnagramsPage } from "./Anagrams/AnagramsPage";
import "./styles/siteTheme.css";
import React from "react";
import BlogView from "./Blog/BlogView";
import { WordsWordsApp } from "./WordsWords/WordsWordsApp";
import { SongbookGame } from "./Guitar/SongbookGame";
import { applyStrumBranding } from "./Guitar/strumBranding";
import { HiLoJackApp } from "./HiLoJack/HiLoJackApp";

type TabId = "home" | "about" | "cv" | "blog" | "games" | "anagrams" | "banagrams" | "seqnc" | "wordswords" | "guitar" | "hilojack" | "god";
type Tab = { id: TabId; label: string };
type LinkItem = { label: string; url: string };
type CurrentProject = { title: string; description: string; links?: LinkItem[] };
type ExperienceItem = { title: string; meta: string; summary: string; links?: LinkItem[] };
type ExperienceSection = { title: string; items: ExperienceItem[] };

const TABS: Tab[] = [
  { id: "home", label: "Home" },
  { id: "about", label: "About" },
  // { id: "cv", label: "CV" },
  { id: "blog", label: "Blog" },
  { id: "games", label: "Games" },
  { id: "god", label: "God" },
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
        summary: "Fulbright visiting researcher in pure mathematics, working with Dr. Barbara Csima on computable structure theory, Scott complexity bounds for reduced abelian p-groups, and algorithmic information theory.",
      },
      {
        title: "University of Pennsylvania",
        meta: "Philadelphia, PA · May 2024 – Aug 2024",
        summary: "Programming languages research assistant to Dr. Steve Zdancewic. Built a denotational semantics for IMP, extended it toward the untyped lambda calculus, and verified key properties in Coq.",
      },
    ],
  },
  {
    title: "Open Source Contributions",
    items: [
      {
        title: "mathlib",
        meta: "Lean 4",
        summary: "Contributed core definitions and results on Turing degrees and reducibility, plus infrastructure for computability-theoretic constructions.",
        links: [
          { label: "Source", url: "https://github.com/leanprover-community/mathlib4/blob/master/Mathlib/Computability/TuringDegree.lean" },
        ],
      },
      {
        title: "Compfiles",
        meta: "Lean 4",
        summary: "Formalized a full USAMO problem, from statement to proof.",
        links: [
          { label: "Problem", url: "https://github.com/dwrensha/compfiles/blob/main/Compfiles/Usa2017P1.lean" },
        ],
      },
      {
        title: "In progress (mathlib/cslib)",
        meta: "Lean 4",
        summary: "Ongoing Lean formalization of Kolmogorov complexity and algorithmic randomness.",
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
        summary: "Led office hours for graduate students, designed exams, and supported the CIS 500 Software Foundations course.",
      },
      {
        title: "University of Pennsylvania",
        meta: "Philadelphia, PA · Aug 2022 – May 2025",
        summary: "Taught weekly recitations, ran office hours, and supported a large-enrollment CIS 120 course.",
      },
    ],
  },
  {
    title: "Sports Analytics",
    items: [
      {
        title: "Wharton Moneyball Academy",
        meta: "Philadelphia, PA · Summer 2022 & Summer 2023",
        summary: "Built baseball models with MCMC, led teaching assistants, and taught statistical modeling in R.",
      },
      {
        title: "Philadelphia Union",
        meta: "Philadelphia, PA · Aug 2022 – Aug 2023",
        summary: "Built player and ball tracking visualizations and models to support performance evaluation and decision-making.",
      },
    ],
  },
];

type AboutSectionId = "education" | "coursework" | "research" | "open-source" | "talks" | "teaching" | "sports-analytics";
type AboutSection = { id: AboutSectionId; label: string };

const ABOUT_SECTIONS: AboutSection[] = [
  { id: "education", label: "Education" },
  { id: "coursework", label: "Coursework" },
  { id: "research", label: "Research" },
  { id: "open-source", label: "Open Source Contributions" },
  { id: "talks", label: "Talks" },
  { id: "teaching", label: "Teaching" },
  { id: "sports-analytics", label: "Sports Analytics" },
];


type GameCard = { id: string; title: string; description: string; imageUrl?: string; onOpen: () => void; disabled?: boolean; status?: string };

const GAME_CARDS: GameCard[] = [
  {
    id: "banagrams",
    title: "Banagrams",
    description: "It's Banagrams, but online.",
    imageUrl: "/images/Banagrams_Photo.png",
    onOpen: openBanagramsInNewTab,
  },
  {
    id: "seqnc",
    title: "SEQNC",
    description: "Inspired by a game I play with license plates in Ontario.",
    imageUrl: "/images/SEQNC_Photo.png",
    onOpen: openSeqncInNewTab,
  },
  {
    id: "anagrams",
    title: "Anagrams",
    description: "Sometimes called Snatch, just a game I grew up playing.",
    imageUrl: "/images/Anagrams_Photo.png",
    onOpen: openAnagramsInNewTab,
  },
  {
    id: "wordswords",
    title: "WordsWords",
    description: "Zipf-ranked subsequence search and benchmarking lab.",
    imageUrl: "/images/WordsWords_Photo.png",
    onOpen: openWordsWordsInNewTab,
  },
  {
    id: "guitar",
    title: "STRUM",
    description: "Your offline guitar library: lyrics, chords, and practice tools.",
    imageUrl: "/images/Guitar_Photo.png",
    onOpen: openGuitarInNewTab,
  },
  {
    id: "formality",
    title: "Formality",
    description: "Turn Lean proofs into diagrams. Expand lemmas, unfold induction, and save the figure.",
    imageUrl: "/images/Formality_Photo.png",
    onOpen: openFormalityInNewTab,
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
    description: "Investigating non-uniformity in realizing the correspondence between random left-c.e. reals and halting probabilities of optimal machines",
  },
  {
    title: "Formalizing Kolmogorov Complexity and Algorithmic Randomness",
    description: "Using Lean to formalize these notions for the mathlib and cslib libraries",
  },
  // {
  //   title: "Formalizing Turing Degrees",
  //   description: "Working with Tanner Duve to contribute to the to mathlib libary by formally defining Turing reducibility",
  // },
];


const SITE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;0,9..144,800;1,9..144,400&family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap";

function TabButton({ tab, active, onClick }: { tab: Tab; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`site-btn${active ? " is-on" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      {tab.label}
    </button>
  );
}

function LinkPills({ links }: { links: LinkItem[] }) {
  return (
    <div className="site-pills">
      {links.map((link) => (
        <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="site-pill">
          {link.label}
        </a>
      ))}
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width={18} height={18} fill="#111827" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function GmailIcon() {
  return (
    <svg viewBox="52 42 88 66" width={20} height={15} aria-hidden="true">
      <path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6" />
      <path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15" />
      <path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2" />
      <path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92" />
      <path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="#0a66c2" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
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

function openFormalityInNewTab() {
  window.open("/formality/", "_blank", "noopener,noreferrer");
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

function openWordsWordsInNewTab() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "wordswords");
    url.searchParams.set("full", "1");
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  } catch {
    window.open("?tab=wordswords&full=1", "_blank", "noopener,noreferrer");
  }
}

function openGodInNewTab() {
  window.open("https://open.spotify.com/show/7hUT0A4fQYB4TgmEZt8BjV?si=5d1633640fe34b97", "_blank", "noopener,noreferrer");
}

function openGuitarInNewTab() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "guitar");
    url.searchParams.set("full", "1");
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  } catch {
    window.open("?tab=guitar&full=1", "_blank", "noopener,noreferrer");
  }
}
const initialNav = (() => {
  try {
    const url = new URL(window.location.href);
    const t = url.searchParams.get("tab");
    const full = url.searchParams.get("full") === "1";
    const post = url.searchParams.get("post");
    if (post) {
      return {
        tab: "blog" as TabId,
        fullBanagrams: false,
        fullSeqnc: false,
        fullAnagrams: false,
        fullWordsWords: false,
        fullGuitar: false,
        fullHiLoJack: false,
      };
    }
    if (t === "home" || t === "about" || t === "cv" || t === "blog" || t === "games" || t === "anagrams" || t === "banagrams" || t === "seqnc" || t === "wordswords" || t === "guitar" || t === "hilojack") {
      return {
        tab: t as TabId,
        fullBanagrams: full && t === "banagrams",
        fullSeqnc: full && t === "seqnc",
        fullAnagrams: full && t === "anagrams",
        fullWordsWords: full && t === "wordswords",
        fullGuitar: full && t === "guitar",
        fullHiLoJack: full && t === "hilojack",
      };
    }
  } catch {
    /* ignore */
  }
  return { tab: "home" as TabId, fullBanagrams: false, fullSeqnc: false, fullAnagrams: false, fullWordsWords: false, fullGuitar: false, fullHiLoJack: false };
})();

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>(initialNav.tab);
  const [fullBanagrams] = useState<boolean>(initialNav.fullBanagrams);
  const [fullSeqnc] = useState<boolean>(initialNav.fullSeqnc);
  const [fullAnagrams] = useState<boolean>(initialNav.fullAnagrams);
  const [fullWordsWords] = useState<boolean>(initialNav.fullWordsWords);
  const [fullGuitar] = useState<boolean>(initialNav.fullGuitar);
  const [fullHiLoJack] = useState<boolean>(initialNav.fullHiLoJack);
  const [choice, setChoice] = useState<LobbyChoice | null>(null);
  const [phase, setPhase] = useState<"waiting" | "game">("waiting");
  const [showInstructions, setShowInstructions] = useState(false);
  const [aboutSection, setAboutSection] = useState<AboutSectionId>("education");

  const tabTitle = useMemo(() => TABS.find((t) => t.id === activeTab)?.label ?? "", [activeTab]);

  useEffect(() => {
    if (choice?.skipWaiting) {
      setPhase("game");
    }
  }, [choice]);
  useEffect(() => {
    if (activeTab === "about") {
      setAboutSection("education");
    }
  }, [activeTab]);
  useEffect(() => {
    if (fullGuitar && activeTab === "guitar") {
      applyStrumBranding();
    }
  }, [fullGuitar, activeTab]);

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
    return <AnagramsPage />;
  }

  if (fullWordsWords && activeTab === "wordswords") {
    return (
      <div style={{ minHeight: "100vh", background: "#020617", color: "#e2e8f0" }}>
        <WordsWordsApp />
      </div>
    );
  }

  if (fullGuitar && activeTab === "guitar") {
    return (
      <div style={{ minHeight: "100vh" }}>
        <SongbookGame />
      </div>
    );
  }

  if (fullHiLoJack && activeTab === "hilojack") {
    return (
      <div style={{ minHeight: "100vh", background: "#0f172a", color: "#f1f5f9" }}>
        <HiLoJackApp />
      </div>
    );
  }



  return (
    <div className="site">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={SITE_FONTS_HREF} />
      <header className="site-header">
        <div className="site-header-inner">
          <div>
            <div className="site-name">Elan Roth</div>
            <div className="site-kicker">{tabTitle}</div>
          </div>
          <nav className="site-nav">
            {TABS.map((tab) => (
              <TabButton
                key={tab.id}
                tab={tab}
                active={tab.id === activeTab}
                onClick={() => {
                  if (tab.id === "god") {
                    openGodInNewTab();
                    return;
                  }
                  setActiveTab(tab.id);
                }}
              />
            ))}
          </nav>
        </div>
      </header>

      <main className="site-main">
        {activeTab === "home" && (
          <section className="site-stack">
            <div className="site-hero">
              <div>
                <h1></h1>
                <p className="site-lede">
                  Researching mathematical logic at the University of Waterloo with Dr. Barbara Csima on a Fulbright Scholarship.
                  I am most interested in computability theory and type theory, especially working with formal proof assistants such as Lean and Rocq.
                </p>
              </div>
              <div style={{ justifySelf: "center" }}>
                <div className="site-photo">
                  <img src="/images/WhoDunIt.jpg" alt="Elan Roth" loading="lazy" />
                </div>
                <div className="site-contacts">
                  <a href="https://github.com/elanroth" target="_blank" rel="noreferrer" aria-label="GitHub" title="GitHub">
                    <GitHubIcon />
                  </a>
                  <a href="mailto:elanmroth@gmail.com" aria-label="Email Elan" title="Email Elan">
                    <GmailIcon />
                  </a>
                  <a href="https://www.linkedin.com/in/elanroth/" target="_blank" rel="noreferrer" aria-label="LinkedIn" title="LinkedIn">
                    <LinkedInIcon />
                  </a>
                </div>
              </div>
            </div>

            <div>
              <h2 className="site-h2">Current Projects</h2>
              <div className="site-list-grid">
                {currentProjects.map((project) => (
                  <div key={project.title} className="site-card">
                    <h3 className="site-card-title">{project.title}</h3>
                    <p className="site-card-text">{project.description}</p>
                    {project.links && <LinkPills links={project.links} />}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === "about" && (
          <section className="site-about">
            <aside>
              {ABOUT_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={`site-side-btn${aboutSection === section.id ? " is-on" : ""}`}
                  aria-pressed={aboutSection === section.id}
                  onClick={() => setAboutSection(section.id)}
                >
                  {section.label}
                </button>
              ))}
            </aside>
            <div style={{ display: "grid", gap: 20 }}>
              {aboutSection === "education" && (
                <section>
                  <h2 className="site-h2">Education</h2>
                  <div className="site-list-grid">
                    {educationItems.map((item) => (
                      <div key={item.school} className="site-card">
                        <div className="site-card-row">
                          <div>
                            <div className="site-card-title">{item.school}</div>
                            <div className="site-meta">{item.location}</div>
                          </div>
                          <div className="site-meta">{item.dates}</div>
                        </div>
                        <div className="site-card-strong">{item.detail}</div>
                        {item.sub && <div className="site-card-text">{item.sub}</div>}
                        {item.honors && item.honors.length > 0 && (
                          <ul className="site-list">
                            {item.honors.map((honor) => (
                              <li key={`${item.school}-${honor}`}>{honor}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {aboutSection === "coursework" && (
                <section>
                  <h2 className="site-h2">Coursework</h2>
                  <div className="site-list-grid">
                    <div className="site-card">
                      <div className="site-card-title">Mathematics (University of Pennsylvania)</div>
                      <div className="site-card-text">{coursework.mathematicsPenn.join(" · ")}</div>
                    </div>
                    <div className="site-card">
                      <div className="site-card-title">Mathematics (Budapest Semester in Mathematics)</div>
                      <div className="site-card-text">{coursework.mathematicsBsm.join(" · ")}</div>
                    </div>
                    <div className="site-card">
                      <div className="site-card-title">Computer Science (University of Pennsylvania)</div>
                      <div className="site-card-text">{coursework.computerScience.join(" · ")}</div>
                    </div>
                  </div>
                </section>
              )}

              {(aboutSection === "research" || aboutSection === "open-source" || aboutSection === "teaching" || aboutSection === "sports-analytics") && (
                <section>
                  {experienceSections
                    .filter((section) => {
                      if (aboutSection === "research") return section.title === "Research";
                      if (aboutSection === "open-source") return section.title === "Open Source Contributions";
                      if (aboutSection === "teaching") return section.title === "Teaching";
                      return section.title === "Sports Analytics";
                    })
                    .map((section) => (
                      <div key={section.title}>
                        <h2 className="site-h2">{section.title}</h2>
                        <div className="site-list-grid">
                          {section.items.map((item) => (
                            <div key={`${section.title}-${item.title}`} className="site-card">
                              <div className="site-card-row">
                                <div className="site-card-title">{item.title}</div>
                                {item.meta && <div className="site-meta">{item.meta}</div>}
                              </div>
                              <p className="site-card-text">{item.summary}</p>
                              {item.links && <LinkPills links={item.links} />}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </section>
              )}

              {aboutSection === "talks" && (
                <section>
                  <h2 className="site-h2">Talks</h2>
                  <div className="site-list-grid">
                    {talks.map((talk) => (
                      <div key={talk.title} className="site-card">
                        <div className="site-card-text" style={{ marginTop: 0 }}>{talk.title}</div>
                        {talk.links && <LinkPills links={talk.links} />}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </section>
        )}

        {activeTab === "blog" && (
          <section style={{ display: "grid", gap: 16 }}>
            <BlogView />
          </section>
        )}

        {activeTab === "cv" && (
          <section>
            <p className="site-card-text">
              Drop a PDF link here or add bullet highlights. This keeps the site light without extra UI.
            </p>
          </section>
        )}

        {activeTab === "games" && (
          <section>
            <div className="site-games">
              {GAME_CARDS.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  className="site-game"
                  onClick={() => {
                    if (!game.disabled) {
                      game.onOpen();
                    }
                  }}
                  disabled={game.disabled}
                >
                  <div className="site-game-head">{game.title}</div>
                  <div
                    className="site-game-img"
                    style={game.imageUrl ? { backgroundImage: `url(${game.imageUrl})` } : undefined}
                  >
                    {!game.imageUrl ? (game.disabled ? "SOON" : game.title.split(" ").map((word) => word[0]).join("").slice(0, 4)) : ""}
                  </div>
                  <div className="site-game-desc">
                    <div>{game.description}</div>
                    {game.status && <div className="site-game-status">{game.status}</div>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
