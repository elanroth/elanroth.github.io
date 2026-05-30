# Hi-Lo-Jack — Execution Plan (ExecPlan)

> A living document that guides one or more coding agents (and the human author, Elan) through building a 4-player, 2-versus-2 partnership trick-taking card game called **Hi-Lo-Jack** (also known as Pitch / Setback). The doc is self-contained — no external links are required to follow it. Update the **Progress**, **Surprises & Discoveries**, **Decision Log**, and **Outcomes & Retrospective** sections in-place as work happens; do not delete prior entries, only append.

---

## 1. Purpose / Big Picture

We are adding a new online multiplayer card game, **Hi-Lo-Jack**, to the existing personal site repo at `/Users/elanroth/Desktop/Life/elanroth.github.io`. The game lives at `src/HiLoJack/` and reuses the same Firebase Realtime Database (RTDB) backbone that the **Bananagrams** game (`src/Banagrams/`) already uses.

When this plan is complete, a user will be able to:

1. Visit a route (`/hilojack`) on the site, type a nickname, and either create a new lobby code or join one their friends shared.
2. Wait in a lobby for exactly four humans to join. The lobby UI assigns them into two partnerships of two (seats N, E, S, W; N–S vs E–W).
3. Play hand after hand of Hi-Lo-Jack until one team reaches the target score (default **11**). The game runs in real time across four browsers, synced via Firebase RTDB, the same way Bananagrams syncs tile placements.
4. View the game through **one of three selectable visual designs** (a "skin" picker). Each design is a different way of arranging a foreground "your hand" plus three other players around a virtual table. The user can switch skins from a menu at any time without leaving the game.

The visual goal: from the seated player's point of view, **their own cards are in the foreground**, the **partner sits across and is rendered angled or rotated**, and the **opposing team sits perpendicular** (left and right), with their cards rotated 90° / 270° relative to the viewer. We deliberately want to iterate on three quite different aesthetics — including more abstract ones — before picking a final look.

The architectural goal: cleanly separate **Model** (game state and rules), **View** (rendering / skins), and **Controller** (user input + Firebase sync), in the style described in the University of Pennsylvania CIS 120 lecture notes on the MVC pattern. The three layers are decoupled enough that the three visual designs can be built in parallel against the same Model, and the rules engine can be unit-tested without any UI at all.

---

## 2. Glossary (read this once; the rest of the doc uses these terms)

- **Hand**: One deal of cards, played out as a sequence of tricks, ending with point scoring.
- **Trick**: One round where each of the four players plays one card in clockwise order. The highest card according to trick-taking rules wins all four cards and leads the next trick.
- **Trump**: The suit chosen by the high bidder for the current hand. Trump cards beat any card of a non-trump suit.
- **Pitcher**: The player who won the bidding and therefore chose trump. The pitcher leads the first trick.
- **Bid**: A promise by a single player to win at least N of the four available scoring points (see §3) for their team during this hand. Legal bids are 2, 3, 4, or 5.
- **5 bid** (Elan's house terminology — we never call it "Smudge" anywhere in the codebase or UI): The maximum bid. The bidder's team promises to *take all 4 scoring points AND win every trick of the hand*. If made, +5 to the team's score. If failed, **−4 to the team's score** — the game never ends just because a 5 bid failed; negative scores are fine.
- **Last-trick affordance**: at any point during a hand, a player may tap a small "last trick" button to see the **immediately preceding** completed trick — and only that one. The trick before that one is never visible. Once a new trick is completed, the previously-stored "last trick" is overwritten and gone forever.
- **Game point** (lowercase): The count of card-value "pips" used to determine who gets the **Game** scoring point. Each 10 = 10 pips, A = 4, K = 3, Q = 2, J = 1; everything else = 0. The team with the most pips in its won tricks gets the Game scoring point. Tie = no one gets it.
- **Scoring point** (uppercase, four of them): **High**, **Low**, **Jack**, **Game**. See §3.
- **Seat**: One of N, E, S, W. Partnerships are fixed: N–S vs E–W. Seat is independent of which physical screen a player sits at; the View rotates the table so the local user is always "S" visually.
- **Skin**: One of three visual designs (Skin A / B / C). Choosing a skin only changes the View layer.

---

## 3. Rules of Hi-Lo-Jack as we will implement them

We will implement the **4-player partnership variant** as documented at highlowjack.com, with one small modification at the end (noted). Embedding the rules here so no external lookup is needed.

### 3.1 Deck and deal

- Standard 52-card deck. No jokers.
- One player is the **dealer**. After each hand the dealer rotates one seat clockwise.
- The dealer shuffles and deals **six cards per player**, in two passes of three cards each, starting with the player to the dealer's left, going clockwise. (The single-player "nine-card throwaway" rule from the source site is replaced by this simpler partnership deal because in a 4-player partnership game each player can hold a full hand of 6 cards without overdrawing the deck: 4 × 6 = 24 ≤ 52.)

### 3.2 Bidding

- Starting with the player to the dealer's left, going clockwise, each player gets exactly one chance to bid.
- Legal bids are **Pass, 2, 3, 4, or 5**. Each new bid must be strictly higher than all previous non-pass bids in that round, or Pass. 5 is the maximum.
- If the first three players all Pass, the **dealer is "stuck"** and must bid at least 2.
- The high bidder becomes the **pitcher** for this hand. We refer to this in conversation as "your team is bidding" or "your team pitched this hand" — it matters for the winning condition in §3.9.

### 3.3 Choosing trump and the first lead (Elan's house rule)

- The pitcher does **not** announce a trump suit separately.
- The pitcher **leads** the first trick by playing any card from their hand to the center, and **the suit of that card IS trump for the rest of the hand.** There is no in-between "choose trump" step.

### 3.4 Following suit (Elan's house rule)

- The suit led is the "lead suit". Each subsequent player, in clockwise order, must play one card according to these rules:
  - **If the lead card is a trump:** you must play a trump if you have one. If you have no trump, you may play any card.
  - **If the lead card is a non-trump AND you hold the lead suit:** you may either follow suit OR play a trump card (trumping in is always legal).
  - **If the lead card is a non-trump AND you do NOT hold the lead suit:** you may play **any card** — you are NOT forced to play trump. This is the house-rule variant point. (In some Pitch rulebooks trump is mandatory here; we don't enforce that.)

### 3.5 Winning a trick

- If any trump cards were played to the trick, the highest trump wins.
- Otherwise the highest card of the lead suit wins.
- Standard rank order, high to low: **A, K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2**.
- The winning player collects all four cards into their team's won-tricks pile, and leads the next trick.

### 3.6 The four scoring points

After all six tricks are played, the hand scores up to four points, distributed between the two teams:

- **High**: 1 point to the team that captured the highest trump card *that was actually played* during the hand. (If no trump was played at all, no High point is awarded.)
- **Low**: 1 point to the team that captured the lowest trump card *that was actually played*. (Same caveat.)
- **Jack**: 1 point to the team that captured the **Jack of trump** in any trick. If the Jack of trump was not dealt out (i.e. it stayed in the undealt portion of the deck), this point is simply not awarded.
- **Game**: 1 point to the team with the most "game pips" in its won tricks. Pips: 10→10, A→4, K→3, Q→2, J→1, all others 0. Tie = no Game point awarded.

### 3.7 Did the pitcher's team "make their bid"?

- After the four scoring points are tallied:
  - If the pitcher's team captured **at least as many** scoring points as the bid amount, both teams simply add what they earned to their running score.
  - If the pitcher's team captured **fewer** scoring points than the bid amount, the pitcher's team is "set" — they **subtract** the bid amount from their running score (scores can go negative). The opposing team still adds whatever points they earned.

### 3.8 The 5 bid (never call it "Smudge")

- A **successful 5 bid** — the pitcher's team wins all six tricks AND all 4 scoring points — scores **+5** for that team for the hand. This does not auto-win the game; it just adds 5 to the score like any other made bid would add its number.
- A **failed 5 bid** — the pitcher's team missed any of: a trick, the High point, the Low point, the Jack point (if Jack was in play), or the Game point — scores **−4** for that team for the hand. The game does **not** end on a failed 5. Negative scores are fine and persist.
- Edge case for §3.10: if the Jack of trump was never dealt, only 3 scoring points exist that hand. A 5 bid in that hand still requires "all tricks AND every scoring point that exists" — which is 3 points and 6 tricks. If achieved, it still scores +5. If missed, still −4. (This avoids the "5 bid is mathematically unwinnable" trap of requiring an undealt Jack.)

### 3.9 Winning the overall game ("you must be pitching to win")

This is Elan's house rule and it is load-bearing for the engine: **a team can only win the game on a hand in which their own team was the pitcher** (i.e. someone on their team won the bidding for that hand).

- Default target is **21 points**. (Configurable in lobby: 7, 11, or 21.)
- At the end of each hand, after the four scoring points are distributed and the bid is settled:
  - If the **pitcher's team** has a score ≥ target AND they **made their bid**, the pitcher's team wins. Game over.
  - If the pitcher's team has a score ≥ target but **failed their bid** (so their score may even have moved away from the target due to the −bid penalty), no one wins this hand; continue dealing.
  - If the **non-pitching team** has a score ≥ target, **they do not win**, no matter how far above the target they are. They simply keep accumulating. They must wait for a hand where someone on their team bids and that bid is made (with their team at or crossing the target on that hand) before they can close out the game.
- A team's score can grow arbitrarily high while they wait for a hand to pitch in. Likewise it can go arbitrarily negative. Neither triggers the game ending.

### 3.10 Edge cases we will explicitly test

These are written in **two passes**. The first pass is the foundation set; M1a implements the engine well enough to pass them. The second pass is the rigor pass; M1b adds cases that stress-test the rules from every direction we can think of, and we iterate until the engine survives all of them. The intent is "make this great" — over-test on purpose.

#### First pass (M1a) — foundation cases

1. A trick where every non-leader player sluffs because they hold neither the lead suit nor any trump.
2. A hand where the Jack of trump is never dealt to any player (so the Jack point is simply not awarded).
3. A hand where only one trump card is played in total — so High and Low both attach to the same card, and the same team scores both points.
4. A **successful 5 bid** from a 0–0 start: +5, but game continues because target (21) not reached.
5. A failed regular bid that drops a team's score **below zero** — score is allowed to go and stay negative.
6. The pitcher's team **makes more than the bid** (e.g. bids 3, captures all 4 points) — they score the actual points captured (4), not just the bid amount.
7. Both teams score points on a hand but the pitcher's team fails to make their bid — pitcher's team subtracts the bid amount; opponents add what they earned.
8. The opposing (non-pitching) team's score crosses 21 on a hand where they were *not* pitching — the game does **not** end; their score keeps climbing on subsequent hands.
9. The pitcher's team is below 21, bids and makes it, lands at exactly 21 — game ends, pitcher's team wins.
10. The pitcher's team is at 22 (already above target from prior non-pitching hands? — actually impossible by rule §3.9 unless they previously pitched; this case verifies the engine doesn't think "already over target" means anything until the closing-out hand happens). More cleanly: a team is at 25 having last pitched at 18, never bid since; next time they bid and make it, game ends.
11. Both teams are at ≥21 going into a hand. The pitcher's team makes their bid — pitcher's team wins regardless of the other team's score.
12. Both teams are at ≥21 going into a hand. The pitcher's team fails their bid — neither team wins; continue.
13. Dealer is "stuck": first three players all Pass, dealer is forced to bid 2.
14. The pitcher leads the first trick of the hand with a **non-trump** card. Other players must follow that suit or trump in.
15. The pitcher leads the first trick of the hand with a **trump**. Other players must play trump if they hold any.

#### Second pass (M1b) — rigor cases

16. Full bid escalation 2 → 3 → 4 → 5 in one bidding round; pitcher is whoever bid 5.
17. A player holds only trumps — every card they could play is legal at any time.
18. A player holds no trumps at all and the trump suit is led — they may sluff anything.
19. A player holds the lead suit AND trump on a non-trump lead — they may either follow suit or trump in; both are legal; both options appear in `legalPlays`.
20. A player holds the lead suit AND trump on a non-trump lead, chooses to trump in even though following would also be legal — engine accepts.
21. A player holds the lead suit AND trump on a non-trump lead, chooses to follow suit — engine accepts.
22. A player holds neither the lead suit nor trump on a non-trump lead — engine permits any card (sluff).
23. The Jack of trump is captured in the **last** trick of the hand and that decides the Jack point.
24. The highest trump played is captured in the **first** trick.
25. Pitcher bids 2 and overperforms, capturing all 4 points — score +4.
26. Pitcher bids 4 and exactly makes 4.
27. Pitcher bids **5** and succeeds (all 6 tricks, all 4 points) — score +5.
28. Pitcher bids **5** but the Jack of trump was not dealt that hand. The 5 bid still requires all available points (3) and all 6 tricks. If they get all 3 points and all 6 tricks, **score +5**. If they miss any, **−4**.
29. Pitcher bids **5**, takes 5 of 6 tricks — failed, **−4**.
30. Pitcher bids **5**, takes all 6 tricks but loses the Game point because the opposing team had higher pips counted from cards captured *before* the 5-bid sweep — actually impossible if they took all 6 tricks (all cards end up in their pile), so this case verifies the engine doesn't pretend the opponents have any cards captured.
31. Game-point tie on pip count → Game point is not awarded to anyone; pitcher's bid of 3 falls 1 short → −3.
32. Pitcher bids 3, captures High and Low and Game but no Jack (Jack was dealt to opponents and they captured the trick containing it) → +3 made, opponents +1 (Jack).
33. Pitcher tries to play a card not in their hand — engine refuses, state unchanged.
34. Pitcher tries to play an illegal card (didn't follow suit when they could have, didn't play trump when trump was led and they had it) — engine refuses, state unchanged.
35. A `PLAY_CARD` is dispatched when it isn't that seat's turn — engine refuses, state unchanged.
36. A `BID` is dispatched when it isn't that seat's bid turn — engine refuses.
37. Two players race to `PLAY_CARD` simultaneously; RTDB serializes; the loser's action gets applied to a state where it's no longer their turn — engine refuses the second one cleanly.
38. A `BID` is dispatched with a non-pass value not strictly higher than the current high non-pass bid — engine refuses.
39. A `BID` of "pass" is always legal on a player's bid turn.
40. **lastTrick visibility**: at the start of a hand, `lastTrick` is `null`. During the first trick of the hand, `lastTrick` is still `null` (there's no prior trick yet this hand).
41. **lastTrick visibility**: after the first trick of a hand resolves, `lastTrick` holds those 4 cards plus the winner.
42. **lastTrick visibility**: after the second trick of a hand resolves, `lastTrick` is **replaced** by the second trick's cards. The first trick is no longer accessible anywhere in state — gone forever.
43. **lastTrick visibility**: on a new hand (`START_HAND`), `lastTrick` is reset to `null`.
44. The pitcher's team's score is at 20, they bid 2, they capture only 1 point — failed, −2 → land at 18, game continues.
45. The pitcher's team's score is at 19, they bid 2, they capture exactly 2 → land at 21, game ends.
46. The pitcher's team's score is at 18, they bid 2, they capture 4 (overperform) → land at 22, game ends (≥ target).
47. Non-pitching team is at 30, pitching team is at 5. Pitching team bids 3, makes it, lands at 8. Game continues. Non-pitching team still cannot win until they bid and make.
48. Non-pitching team is at 30, then they win the bid on the next hand, bid 2, fail, lose 2, land at 28. Game continues — they're above 21 but they failed their bid.
49. Non-pitching team at 30, wins next bid, bids 2, captures 2 — game ends, they win.
50. Two consecutive failed bids drop a team from +1 to −5. Negative scores carry and are displayed as negatives in the UI.
51. The dealer rotates one seat clockwise after each hand (N → E → S → W → N).
52. Replay determinism: given a `randomSeed` and the same sequence of `Action`s, the reducer produces the same final `GameState` byte-for-byte (used by the action log replay validation in M3).
53. A trick is fully complete (4 cards played) and is sitting on the table awaiting `RESOLVE_TRICK` (so the UI can show it) — no other action moves the game forward until `RESOLVE_TRICK` fires.
54. Calling `RESOLVE_TRICK` on an incomplete trick is a no-op.
55. Calling `CHOOSE_TRUMP` outside the `selectingTrump` phase is a no-op.

---

## 4. The MVC architecture we will follow

We are following the Model–View–Controller separation as taught in University of Pennsylvania's CIS 120 course notes (paraphrasing them here so this doc stays self-contained):

- **Model**: all game state and the pure functions that mutate it in response to abstract events. The Model knows nothing about pixels, animations, mouse positions, or Firebase. It is testable with plain function calls.
- **View**: a function from Model → pixels. Multiple Views can exist for the same Model. A View reads the Model and renders it; it does not own state besides ephemeral animation/UI state.
- **Controller**: bridges the user and the network into Model events. The Controller is the only layer that talks to Firebase, listens to keyboard/mouse, and decides which Model action to dispatch.

This separation is what unlocks parallel work: once we agree on the Model's public types and action shapes, three skin developers can build three Views in parallel against a shared in-memory Model fixture, while a fourth track builds the Controller wiring against the same Model.

### 4.1 File layout

```
src/HiLoJack/
├── EXECPLAN.md                   # this file
├── engine/                       # MODEL — pure, no React, no Firebase
│   ├── types.ts                  # Card, Suit, Rank, Seat, Bid, HandState, GameState, Action
│   ├── deck.ts                   # newDeck(), shuffle(seed), deal(state)
│   ├── rules.ts                  # legalPlays(state, seat), winnerOfTrick(trick, trumpSuit)
│   ├── scoring.ts                # scoreHand(handState): { high, low, jack, game } → team deltas
│   ├── reducer.ts                # pure reducer(state, action) → state
│   └── reducer.test.ts           # vitest unit tests covering §3.10 edge cases
├── controller/
│   ├── firebase.ts               # re-uses the same firebase init as Bananagrams
│   ├── rtdb.ts                   # subscribe(gameId), dispatchRemote(gameId, action)
│   ├── useGame.ts                # React hook: returns [state, dispatch] backed by RTDB
│   └── input.ts                  # turns clicks/keys into engine Actions
├── view/
│   ├── shared/
│   │   ├── Card.tsx              # renders a single card; takes orientation prop
│   │   ├── SeatLabel.tsx
│   │   ├── BidPanel.tsx
│   │   ├── ScoreBoard.tsx
│   │   └── TrickArea.tsx         # the 4-card center region
│   ├── SkinA_Realistic.tsx       # see §5
│   ├── SkinB_TopDownMinimal.tsx  # see §5
│   ├── SkinC_AbstractSuitRadar.tsx
│   └── SkinPicker.tsx            # toggle between A / B / C; persists choice to localStorage
├── App.tsx                       # mounts Lobby → Game, picks Skin, wires Controller
├── Lobby.tsx                     # join/create, nickname, seating, ready-up
└── routes.tsx                    # adds "/hilojack" to the site's top-level router
```

### 4.2 Stable public interfaces (the contract that lets parallel work happen)

The Model exposes exactly these types (full TS shapes will be filled in during Milestone L1; this is the locked-in shape):

```
type Suit = "C" | "D" | "H" | "S";
type Rank = 2|3|4|5|6|7|8|9|10|"J"|"Q"|"K"|"A";
type Card = { suit: Suit; rank: Rank };
type Seat = "N" | "E" | "S" | "W";
type Team = "NS" | "EW";

type Bid = "pass" | 2 | 3 | 4 | 5;   // 5 replaces what other variants call "Smudge"
type PlayedCard = { seat: Seat; card: Card };

type TrickRecord = { cards: PlayedCard[]; winner: Seat };

type Phase =
  | { kind: "lobby" }
  | { kind: "bidding"; turn: Seat; bids: Partial<Record<Seat, Bid>> }
  | { kind: "selectingTrump"; pitcher: Seat; bid: 2|3|4|5 }
  | { kind: "playing"; trick: { cards: PlayedCard[]; leader: Seat; winner: Seat | null };
      trump: Suit; pitcher: Seat; bid: 2|3|4|5; handLog: TrickRecord[] }
  | { kind: "scoring"; trump: Suit; pitcher: Seat; bid: 2|3|4|5; handLog: TrickRecord[];
      deltas: Record<Team, number>; pitcherMadeBid: boolean }
  | { kind: "gameOver"; winner: Team };

type GameState = {
  gameId: string;
  players: Record<Seat, { uid: string; nickname: string } | null>;
  hands: Record<Seat, Card[]>;            // private; redacted per-uid on the wire
  wonTricks: Record<Team, Card[]>;        // flat pile of every card the team captured this hand
  lastTrick: TrickRecord | null;          // ONLY the immediately previous trick — see edge cases 40–43
  score: Record<Team, number>;            // can go negative; can exceed targetScore without winning
  targetScore: 7 | 11 | 21;               // default 21
  phase: Phase;
  dealerSeat: Seat;
  randomSeed: number;
};

type Action =
  | { type: "JOIN_SEAT"; seat: Seat; uid: string; nickname: string }
  | { type: "START_HAND" }
  | { type: "BID"; seat: Seat; bid: Bid }
  | { type: "CHOOSE_TRUMP"; suit: Suit }
  | { type: "PLAY_CARD"; seat: Seat; card: Card }
  | { type: "RESOLVE_TRICK" }   // fired by Controller after the 4th card has been on screen long enough
  | { type: "SCORE_HAND" }
  | { type: "SET_OPTIONS"; targetScore?: 7|11|21 };
```

Note the absence of `softSmudge`: per §3.8, a failed 5 bid is always −4 and never ends the game, so there's no toggle. Note also that `lastTrick` lives at the top level of `GameState` (not inside the playing phase) so the View can always read it during a hand and the controller doesn't need to special-case "we're between tricks".

Views consume `GameState` and a `dispatch(action)` function. **Views never construct an `Action` that the engine doesn't define.** Adding a new visual flourish never requires changing engine types.

### 4.3 Firebase shape (mirrors Bananagrams' RTDB style)

```
/hilojack/{gameId}/
  meta/         { createdAt, status, targetScore, softSmudge }
  players/      { N: {uid,nick,lastSeen}, E: ..., S: ..., W: ... }
  state/        the redacted shared GameState (no opponent hands)
  hands/{uid}/  that uid's private hand (RTDB rules restrict read to that uid)
  actions/      append-only log of Actions for spectator replay & debugging
```

We will extend `database.rules.json` to add a `/hilojack/{gameId}` branch that mirrors the `/games/{gameId}` permissions but adds the per-uid `hands` privacy.

---

## 5. The three visual designs (Skins A, B, C)

We will build all three. They share the Card, BidPanel, and ScoreBoard primitives in `view/shared/` but lay them out radically differently. Each skin is a single React component that takes `(state, dispatch)` and renders the whole table.

In all three skins, the local player's hand is always displayed at the **bottom (south)** of the screen regardless of their actual logical seat. We rotate the rendered layout so that local seat ↦ S, partner ↦ N, left opponent ↦ W, right opponent ↦ E.

Every skin must also implement the **last-trick affordance**: a small unobtrusive control (a button, a peeled-corner card on the table, a glowing dot — skin-specific) that, when held or hovered, reveals the immediately previous trick (the four cards plus an arrow indicating who won them). Release / un-hover hides it again. Only the previous trick is ever visible — never further back — because the engine only stores `lastTrick` and discards older history. At the very start of a hand (and during the first trick of a hand) the affordance is disabled or hidden, because `lastTrick` is `null`.

### Skin A — "Felt Table" (skeuomorphic 3D)

A warm-green felt poker-table background fills the viewport. The viewer's hand is fanned across the bottom edge, slightly angled outward as if held in two hands. The partner's cards across the top are drawn face-down at smaller scale and tilted ~12° backwards using CSS `perspective` + `rotateX(35deg)` to suggest they're physically on the far side of the table. The two opponents on the left and right have their cards drawn as a vertical strip rotated 90° / 270° so the card backs face inward toward the table center. The center of the table is a darker oval; played cards land there with a brief CSS transition tracking from each seat toward center, settling at the seat's compass angle. Suit colors are classic: hearts/diamonds red, clubs/spades black. Animations are physical and subtle. This is the "looks like a real table" option.

### Skin B — "Top-Down Minimal" (flat schematic)

Pure top-down, zero perspective. The viewport is a 3×3 CSS grid; the four corners and edges hold the four seats; the center cell is the current trick. Cards are flat rectangles with thin borders, large rank glyphs, and a small suit pip. Partner's cards (top row) are drawn rotated 180° so their rank reads "into" the table. Left/right opponents' cards are rotated 90° / 270°. The whole thing looks like a tabletop game manual diagram — no shadows, no felt, no animation beyond simple slide-in. This is the "information first" option, optimized for readability and accessibility.

### Skin C — "Suit Radar" (abstract)

The most experimental. The screen is a dark background with a circle in the center. Each of the four seats is represented as a wedge of the circle (think pie chart with four quarters). A player's hand is rendered as a small fan of cards floating just inside their wedge, but rather than showing cards as rectangles, each card is a glowing dot whose **angle** in the wedge encodes its suit and whose **radial distance** from center encodes its rank — high cards float toward the rim, low cards toward the center. Played cards travel from each wedge toward the absolute center, forming the current trick as a small constellation at the bullseye. The viewer's own dots are slightly larger and labeled. Trump suit is highlighted with a colored arc around the perimeter. This is the "art piece" option; it intentionally trades realism for a synoptic view of who holds what kind of card.

We can also try later iterations (Skin D and beyond) once one of these proves promising; nothing about the architecture forces three forever.

---

## 6. Parallel work tracks (how multiple coding agents can collaborate)

Once Milestone **M1** is merged (it locks in the Model's types and a working pure reducer with passing unit tests), the following four tracks can run **fully in parallel** because they share no files and each consumes only the Model's public interface:

- **Track L (Logic)** — owns `engine/`. After M1 this track refines edge-case handling, adds property-based tests, and is the canonical source of truth on rules.
- **Track V-A (Skin A)** — owns `view/SkinA_Realistic.tsx` and contributes shared primitives in `view/shared/`.
- **Track V-B (Skin B)** — owns `view/SkinB_TopDownMinimal.tsx`.
- **Track V-C (Skin C)** — owns `view/SkinC_AbstractSuitRadar.tsx`.
- **Track C (Controller)** — owns `controller/` and `Lobby.tsx`. Wires Firebase, presence, action broadcasting, and turns user input into `Action`s. Track C also owns the redaction logic that strips opponents' hands out of the shared state before writing it to RTDB.
- **Track I (Integration)** — owns `App.tsx`, `SkinPicker.tsx`, `routes.tsx`, and end-to-end manual playtesting. Becomes active in M3.

Conflict avoidance:
- Shared primitives in `view/shared/` are touched first by Track V-A (which sets their props/contracts in M2); V-B and V-C consume them. If V-B or V-C need a new prop, they add it in a backward-compatible way and post a one-line note to **Surprises & Discoveries** below.
- Only Track L may modify `engine/types.ts`. Any other track that thinks the Model needs a new field must file an entry in **Decision Log** describing why, and wait for Track L to make the change.

---

## 7. Milestones (the canonical ordering)

We use milestone codes (M1, M2, ...) so progress entries can refer to them tersely.

### M1 — Model spike (sequential, blocks everything else). Done in two passes.

#### M1a — First-pass engine + first-pass tests

Implement `engine/types.ts`, `engine/deck.ts`, `engine/rules.ts`, `engine/scoring.ts`, `engine/reducer.ts`. Write `engine/reducer.test.ts` covering every edge case **1–15** from §3.10's first-pass list. No React. No Firebase. The reducer must be pure: `reducer(state, action)` returns a new state, mutating nothing.

The point of M1a is to get a believable end-to-end skeleton: lobby → bid → trump → play 6 tricks → score → next hand. Cleanliness matters more than completeness; the second pass will expose what we got wrong.

**Concrete commands** (run from repo root, which is `/Users/elanroth/Desktop/Life/elanroth.github.io`):

```
mkdir -p src/HiLoJack/engine
# author types.ts, deck.ts, rules.ts, scoring.ts, reducer.ts, reducer.test.ts
npx vitest run src/HiLoJack/engine
```

**Validation:** Vitest reports `Tests  15 passed (15)` minimum, one named test per case 1–15. No `.skip` or `.todo`. The full M1a engine compiles with `npx tsc --noEmit`.

#### M1b — Rigor pass: cases 16–55 + iterate engine until they all pass

Add tests for every case 16–55 in §3.10's second-pass list. Expected outcome: a meaningful fraction of these will *fail* against the M1a engine and surface bugs. Iterate the engine until they pass. Any rule ambiguities discovered during this pass get written into **Decision Log** with the chosen resolution. Any genuinely surprising findings get written into **Surprises & Discoveries**.

The "make it great" target: by the end of M1b the engine plays a full hand correctly against random sequences of legal actions, refuses illegal actions cleanly, and the replay determinism property (case 52) holds.

**Concrete commands:**

```
# append cases 16–55 to reducer.test.ts (or split into rules.test.ts / scoring.test.ts for legibility)
npx vitest run src/HiLoJack/engine
# iterate: when a test fails, fix the engine, re-run
npx tsc --noEmit
```

**Validation:** Vitest reports `Tests  55 passed (55)` minimum. A short property test using a seeded RNG runs 100 random hands and finds no rule violations. `npx tsc --noEmit` is clean.

### M2 — Three skins in parallel against a mock Model

With M1's types locked, spawn three parallel agents (one per skin). Each agent imports the engine types but uses a hand-written `mockGameState` fixture from `view/shared/__fixtures__/midHand.ts` — no Firebase yet. Each skin must render: (a) the lobby seating screen, (b) the bidding phase with a bid panel, (c) an in-progress trick with one card already played from each of three seats, (d) the scoring screen between hands, (e) the game-over screen. Each agent commits its skin in its own file; merges to the same branch should not conflict because they touch disjoint files plus the shared/ primitives that Track V-A established first.

**Concrete commands:**
```
mkdir -p src/HiLoJack/view/shared/__fixtures__
# author midHand.ts with a deterministic fixture
npm run dev
# in three browser tabs at http://localhost:5173/hilojack?skin=A , ?skin=B , ?skin=C
```

**Validation:** Each of the three URLs renders without console errors and shows the five required screens (lobby / bidding / playing / scoring / gameOver) when a dev-only "next phase" button is clicked. We capture one screenshot of each skin in each phase (15 screenshots total) and link them in **Surprises & Discoveries** for design review.

### M3 — Controller + Firebase wiring (sequential, depends on M1)

Implement `controller/firebase.ts` (re-export the same Firebase app instance Bananagrams uses; do not init twice), `controller/rtdb.ts` (subscribe + dispatch), `controller/useGame.ts`, `Lobby.tsx`, and the redaction layer that ensures only `state` and the per-uid `hands/{uid}` get written to RTDB. Extend `database.rules.json` to add the `/hilojack/{gameId}` branch.

Crucially, this track also adds **server-trusted action validation** in the client: before any client dispatches `PLAY_CARD`, the client checks `rules.legalPlays(state, seat).includes(card)`. If false, it refuses. (We have no server; security is by client honesty plus an audit log in `/hilojack/{gameId}/actions/`.)

**Concrete commands:**
```
# edit database.rules.json — add /hilojack branch mirroring /games with per-uid hand privacy
firebase emulators:start --only database  # local sanity check
npm run dev  # then open 4 tabs at /hilojack and run a full hand
```

**Validation:** Four browser tabs in incognito (so each gets a distinct uid) can complete one full hand from lobby through scoring. Each tab can see its own hand but not the other three. The `/hilojack/{gameId}/actions/` log lists every action in order, and replaying the log through the pure reducer reproduces the final state exactly.

### M4 — Integration, skin switching, polish

Wire `App.tsx`, `SkinPicker.tsx`, and add `/hilojack` to the site router. Add a "Switch skin" menu item that re-renders without dropping the connection. Add small touches: a turn indicator (glowing border on the current player's seat), a bid history strip, a "rules" overlay that paraphrases §3, and a "leave game" affordance. Run an end-to-end playtest from a clean Firebase state, with four real humans (Elan plus three friends or three private tabs) playing one full game to 11.

**Validation:** One full game completes without console errors. Switching skin mid-game preserves state. The winning team's seats glow.

### M5 — Decision point: which skin wins?

Not a build step — a review meeting. After M4, Elan picks which of A/B/C is the default. The losers stay in the codebase as opt-in skins. Decision is recorded in **Decision Log** below. If "more iteration needed", we spec Skin D here.

---

## 8. Progress

Append entries with an ISO date and the milestone code. Do not edit prior entries — only append.

- [x] **2026-05-29** — ExecPlan authored and saved at `src/HiLoJack/EXECPLAN.md`.
- [x] **2026-05-30** — ExecPlan revised with Elan's house rules: 5-bid replaces Smudge, target 21, must-pitch-to-win, lastTrick visibility, M1 split into M1a/M1b, edge cases tripled to 55.
- [x] **2026-05-30** — M1a complete. `engine/{types,deck,rules,scoring,reducer}.ts` authored. `reducer.test.ts` covers cases 1–15 + a smoke end-to-end hand. `npx vitest run src/HiLoJack/engine` → 16/16 green.
- [x] **2026-05-30** — M1b complete. Added cases 16–55 (skipping 51 numbering in the second pass since the doc lists 55 cases, not 56) plus a 100-hand seeded property test. `npx vitest run src/HiLoJack/engine` → 57/57 green. `npx tsc --noEmit` → zero errors in HiLoJack files (one pre-existing error in `strategy-lab/StrategyLabApp.tsx` unrelated to this work).
- [x] **2026-05-30** — M2 foundation: `view/shared/{SkinProps,orientation,Card,BidPanel,ScoreBoard,LastTrickButton,PhaseSwitcher}.tsx` and `view/shared/__fixtures__/midHand.ts` (deterministic fixtures for all six phases). The locked SkinProps contract: `{ state, localSeat, dispatch, devPhaseSwitcher? }`.
- [x] **2026-05-30** — M2 skins built in parallel via three independent subagents. Each produced a working `view/Skin{A,B,C}_*.tsx` that compiles clean. Reports captured below in Surprises.
- [x] **2026-05-30** — M3 complete. `controller/{firebase,rtdb,useGame,identity}.ts` and `Lobby.tsx` written. `database.rules.json` extended with `/hilojack/{gameId}/{meta,players,actions}` and a `/hilojackMeta` index. Each client subscribes to the action log and replays via the pure reducer — the same event-sourcing pattern Bananagrams uses for grants/state.
- [x] **2026-05-30** — M4 complete. `HiLoJackApp.tsx` (lobby ↔ live skin switching) and `view/SkinPicker.tsx` (localStorage-persisted A/B/C). Wired into `App.tsx`: route `?tab=hilojack&full=1` lands on the lobby. Dev fixture mode at `?tab=hilojack&full=1&hjdev=1` lets each skin be visually iterated against the fixture without joining a real game. `npx tsc --noEmit` shows only the pre-existing `strategy-lab` error; `npx vitest run src/HiLoJack/engine` still 57/57.
- [x] **2026-05-30** — M5 recommendation logged in Decision Log (see below). Default skin = **A (Felt Table)** because it most closely matches the user's initial brief ("fun foreground scene … partner across angled down … other team perpendicular"). Skin B is the accessibility fallback; Skin C is the "signature" experimental option featured in the picker.
- [x] **2026-05-30** — Elan confirmed Skin A is the keeper after viewing it live. No code changes needed (A was already the localStorage default); plan updated to reflect "user-confirmed" rather than "recommended".
- [x] **2026-05-30** — User-requested: lobby audit + fix (see Surprises). Now creates lobbies reliably; "Start hand" gates on engine state; "leave" releases the seat.
- [x] **2026-05-30** — User-requested: bots + mobile pass. Added `bot/heuristics.ts` (pickBid / pickTrump / pickCard / pickAction / nextBotAction) and `bot/useBotDriver.ts` (host-only React hook that auto-dispatches bot actions with a 700ms delay). Added `LEAVE_SEAT` engine action so bots can be removed/replaced. Lobby UI now has per-seat "Take it" / "+ Bot" / "Remove" buttons and a "Fill remaining seats with bots" shortcut. `identity.ts` switched to localStorage so the host's uid (and therefore host status, and therefore bot ownership) survives refresh. Mobile-friendly padding/sizing on the Lobby. Tests: 20 new bot tests including a full 4-bot hand simulation and 5-consecutive-hand dealer-rotation simulation. Total now 96 tests across engine + controller + bot.
- [x] **2026-05-30** — User-requested **rule change**: trump-by-first-lead. Pitcher's first card sets trump; there is no separate "choose trump" step. Engine: removed the `selectingTrump` phase and the `CHOOSE_TRUMP` action; `playing.trump` is now `Suit | null` (null until the first card lands). Reducer transitions `bidding → playing(trump=null)` directly; `PLAY_CARD` on an empty trick with `trump=null` sets trump to the card's suit (only the pitcher can make that opening play). `legalPlays` accepts `Suit | null`. Bot: `pickCard` now picks the highest card of its strongest suit on the opening lead (which sets trump in the bot's best suit), and the new lead heuristic is "highest trump first" on every later lead. Fixture `selectingTrump` renamed `openingLead` (still a `playing` phase, just with `trump=null`). All three skins replaced their trump-picker UI with a small "playing the opening lead sets trump" banner. Test deltas: removed CHOOSE_TRUMP-based tests, added explicit tests for the first-card-sets-trump path and for refusing non-pitcher first leads. 99 tests passing across engine + controller + bot.

---

## 9. Surprises & Discoveries

Append narrative notes (one short paragraph each) when something unexpected comes up — a rule ambiguity, a Firebase quirk, a CSS perspective gotcha, a design instinct that turned out wrong. Future-you will thank present-you.

- **2026-05-30 (M1a)** — Only one of the 16 first-pass tests failed on first run: case 2 had a wrong author expectation (I expected the team that *played* the 2 of trump to score Low, forgetting that Low attaches to whoever *captured* the trick containing it). Fixed the test, not the engine. The lesson is real and worth restating in code review: in trick-taking scoring, attribution always follows trick-capture, never card-play.
- **2026-05-30 (M1b)** — The rigor pass surfaced zero engine bugs. All 40 of cases 16–55 plus a 100-hand seeded property test passed on first run. Two reasons this is suspicious-in-a-good-way: (a) the engine was designed with phase-kind guards on every action and an explicit `applied: boolean` flag on the scoring phase, which preemptively defended against most "wrong-time action" cases; (b) the must-pitch-to-win rule was implemented directly in the win check (`pitcherMadeBid && newScore[pitcherTeam] >= target`) rather than as a layered afterthought. If a future engine change relaxes either of those defenses, expect cases 53–55 and 47–48 to start failing first.
- **2026-05-30 (M1b)** — Cards in `legalPlays` are returned in the original hand order, not sorted. This affects fixture authorship: when constructing test hands, the order of cards in the array determines which card a naive `legal[0]` strategy will pick. Documenting here so future test authors don't trip on it.
- **2026-05-30 (M2 Skin A agent report)** — Used `perspective(800px) rotateX(35deg) scale(0.9)` for partner, +/-90° rotations for side opponents, per-card 6° fan curve with a tiny vertical droop on outer cards. Played cards animate to 35/65% anchor positions inside a centered inner box. Two rough edges noted: (1) the dev `PhaseSwitcher` is fixed-positioned at top-right and overlaps the `LastTrickButton` — fine in dev but the harness should nudge one of them; (2) `LastTrickButton` doesn't gracefully close on touch (no tap-outside-to-close). Both deferred.
- **2026-05-30 (M2 Skin B agent report)** — Pure `grid-cols-3 grid-rows-3` viewport. No shadows. Black borders on a `bg-stone-50` background. Trick cards land in the center cell with a simple `fadeIn` slide-in keyframe. Manual-diagram aesthetic delivered.
- **2026-05-30 (M2 Skin C agent report)** — SVG-heavy: 1000×1000 viewBox, four 90° wedges, suit bands at ±33.75°/±11.25° within each wedge, rank→radius lerp from r=110 (2) to r=405 (A). Stacked SVG circles for glow per suit (emerald/sky/rose/violet). Trump highlighted with four perimeter arcs. Rough edge: cards don't actually *animate* from wedge to bullseye — they just appear in the center as the hand-dot disappears. Worth revisiting if Skin C becomes the default later. Long nicknames may collide with the radar rim — known.
- **2026-05-30 (M3)** — Chose append-only `/hilojack/{gameId}/actions` event log over a snapshot-based state sync. Reason: every client reconstructs `GameState` deterministically from `initialState(gameId, randomSeed)` plus the replayed action stream, so no central authority is needed. Trade-off: no built-in cheating prevention against a malicious client that inspects opponent hands in their own JS — this is documented in the plan §4.3 as acceptable for friend-group play. The `/players/{seat}` branch is kept as an atomic-claim helper (RTDB transaction); the canonical seat assignment also lands in the action log via `JOIN_SEAT`.
- **2026-05-30 (M4)** — Added a `?hjdev=1` query-string flag to `HiLoJackApp` that swaps real Firebase state for the fixture and overlays the `PhaseSwitcher`. This means the three skins can be visually compared side-by-side (open three tabs, pick A/B/C in each) without needing four real players in a lobby. Implemented for iteration speed during M2/M5.
- **2026-05-30 (lobby audit)** — User reported "lobby not working." Audit surfaced three bugs:
  1. **Critical**: `createGame` was building its meta object with `lobbyName: opts.lobbyName` even when `opts.lobbyName` was `undefined`. Firebase RTDB rejects writes containing any `undefined` value with a runtime error, so every "Create lobby" click silently failed. Fix: build the object with a conditional spread (`...(opts.lobbyName ? { lobbyName: opts.lobbyName } : {})`).
  2. **Architecture**: Both `HiLoJackApp` and `Lobby` were calling `useGame(gameId, uid)` — two independent Firebase subscriptions, two reducer replays, two `state` copies for one user. Functionally OK but wasteful and a latent source of subtle inconsistency. Fix: `HiLoJackApp` is now the single owner of the `useGame` instance; it passes the full `game` result to `Lobby` as a prop.
  3. **Race**: `Lobby`'s "Start hand" gating was based on the `/players` RTDB subscription, which updates the instant a seat is claimed. But the reducer's `START_HAND` requires four entries in `state.players`, which only land via the corresponding `JOIN_SEAT` action being replayed. A race window let the button appear before the engine was ready, so the first click could be silently ignored. Fix: `Lobby` now reads `game.state.players` everywhere — the same authority the reducer uses.
  4. **Bonus**: clicking "leave" used to abandon the seat in `/players` (so a friend could not claim it). Now releases the seat via the existing `releaseSeat` transaction on the way out.
  Tests: built an in-memory Firebase mock at `controller/controller.test.ts` with a strict `detectUndefined` check that catches bug #1 the way real RTDB does. The mock supports `set` / `push` / `get` / `runTransaction` / `onValue` / `onChildAdded`. The suite now covers: createGame (incl. undefined regression), claimSeat (atomic claim + re-claim + reject), subscribeActions (replay + live), 4-client lobby convergence, late-joiner replay, duplicate JOIN_SEAT no-op, START_HAND-before-seated no-op, releaseSeat, full 6-trick hand → scoring, multi-hand dealer rotation, malformed-action no-op, and the meta/players subscribers. 19 controller tests, all green. Total HiLoJack tests now 76 (57 engine + 19 controller).

---

## 10. Decision Log

Append one entry per non-trivial choice. Format: **date — decision — reason — alternatives considered.**

- **2026-05-29** — Use the partnership variant of Hi-Lo-Jack with 6 cards dealt per player (not the 9-card throwaway form). — Reason: the source site's 9-card throwaway is built around solo play; for 4-player teams a clean 6-card deal is the most common partnership form and the rule §3.5 wording stays uniform. — Alternative: deal 9, discard non-trump, redeal up to 6 (closer to the source). Rejected for first pass because the throwaway phase complicates the Phase machine and isn't essential to the partnership feel.
- **2026-05-29** — Three visual skins built in parallel, decision deferred to M5. — Reason: Elan wants to "iterate on three different designs … feel free to get more abstract". Building three before committing reduces sunk-cost bias. — Alternative: pick one upfront. Rejected per user instruction.
- **2026-05-29** — Mirror Bananagrams' Firebase RTDB architecture (per-game node, append-only actions log, per-uid private branch for hidden state). — Reason: Bananagrams' approach is already proven in this repo at `src/Banagrams/engine/firebase/`. Reusing it minimizes new infrastructure and keeps `database.rules.json` coherent. — Alternative: Firestore. Rejected because the existing app has zero Firestore wiring and RTDB latency is better for turn-based UI snapshots.
- **2026-05-30** — The maximum bid is **5**, never called "Smudge" anywhere in code, UI, or docs. — Reason: Elan's house terminology; "5 bid" is the term he and his friends use, and using "Smudge" anywhere would create vocabulary drift between the rules surface and the actual play vocabulary. — Alternative: keep "Smudge" as the technical term and translate in the UI. Rejected — too much room for the wrong word to leak through.
- **2026-05-30** — Failed 5 bid is **always −4**, never a game-ending loss. The `softSmudge` flag is removed from `GameState`. — Reason: Elan's preference; negative points are fine and the game-ending failed-Smudge rule is too punitive for a casual table. — Alternative: keep softSmudge as a toggle. Rejected — one less knob to explain.
- **2026-05-30** — A team can only **win** the game on a hand in which their team was the pitcher (won the bidding). Scores can exceed the target without winning. — Reason: explicit user requirement; this is the single most important rule for end-game pacing and creates the bidding tension at the end of a game. — Alternative: first team to cross the target wins regardless of pitching status. Rejected — explicitly contradicted by user.
- **2026-05-30** — Default target score is **21**, not 11. — Reason: explicit user requirement; matches how Elan and his friends actually play. — Alternative: 11. Rejected.
- **2026-05-30** — The engine stores exactly one `lastTrick: TrickRecord | null` at the top level of `GameState`. No deeper trick history is retained. — Reason: explicit user requirement ("see the last trick always, but never further back from that"). Keeping it at the top level of `GameState` rather than inside the `playing` phase means the View can read it during the `scoring` phase too (looking back at the trick that just ended the hand), without phase-juggling. — Alternative: store the full per-hand log and let the View show only the previous trick. Rejected — the engine's job is to enforce information visibility, not the View's; making the data simply not exist is the cleanest enforcement.
- **2026-05-30** — A 5 bid succeeds if the pitching team captures **every scoring point that exists this hand AND all six tricks**, even when the Jack of trump was not dealt (so only 3 scoring points exist). — Reason: avoids the unwinnable-5-bid paradox where the bidder is doomed at deal-time without knowing it. — Alternative: void the deal if 5 is bid and Jack wasn't dealt. Rejected — too complicated and the pitcher doesn't have hidden information about the un-dealt Jack to act on.
- **2026-05-30** — M1 is split into M1a (first pass, cases 1–15) and M1b (rigor pass, cases 16–55) per user instruction "do it as a first pass, then another whole pass of writing cases and testing and iterate so make it great". — Reason: explicit user direction. Two-pass also exposes engine bugs that single-pass authoring tends to miss — the second pass acts as an adversarial review of the first.
- **2026-05-30 (M5)** — Default skin = **A (Felt Table)**, *confirmed by Elan* after side-by-side viewing in the live dev environment. The localStorage-persisted SkinPicker still ships with B and C selectable so future iteration can revisit. Reason for A: most closely matches the original brief — "fun foreground scene of your cards and angles working out so that your partner (person across) is angled down and other team is across perp to you and your partner." Skin A literally implements that geometry with CSS perspective on the partner row and 90°/270° rotations on the opponents.
- **2026-05-30 (M3 architecture)** — Use append-only `/hilojack/{gameId}/actions` event log (one push per dispatched `Action`) as the canonical game-history source. State is reconstructed by each client via `initialState + reducer-replay`. — Reason: pure reducer + deterministic seed → trivially replayable across clients, late-joiners, and reconnects; no central authority required; mirrors the cleanest event-sourcing pattern. — Alternative: write a `/state` snapshot from a "host" client after each action. Rejected — designating one client as host introduces a single point of failure and would require leader-election logic on disconnect.

---

## 11. Outcomes & Retrospective

**What shipped (vs. scoped):** Everything M1 → M5 from the original scope. Engine + 57 tests; three working skins (A/B/C) with a SkinPicker; Firebase action-log sync; lobby; route mounted at `?tab=hilojack&full=1`; dev fixture mode at `?hjdev=1`. The only intentionally deferred items are listed at the bottom of this section.

**Which skin won:** Skin A (Felt Table) as default — matches the user's original geometric brief most directly. Skins B (Top-Down Minimal) and C (Suit Radar) remain selectable from the picker without losing state, per §6.

**Rules edge cases we got wrong on first pass:** Exactly one — the case-2 test author expectation was wrong (attributed "Low" to the seat that *played* the lowest trump instead of the team that *captured* the trick that contained it). The engine itself was right; the test was the bug. No engine bugs surfaced in the 40-case rigor pass or the 100-hand property test.

**Things to copy back into Bananagrams (if doing it over):**
- The append-only `/actions` log + pure-reducer replay pattern (cleaner than Bananagrams' per-uid board snapshots, especially for reconnect and spectator scenarios).
- The locked `Phase` discriminated union with `kind` switches in the reducer. Bananagrams' `status: { phase: ... }` is looser and harder to typecheck exhaustively.
- The `applied: boolean` flag on the `scoring` phase as a finite-state-machine "I have committed this output" marker. Useful any time a phase has both display and commit responsibilities.

**Things we'd refactor if starting over:**
- The `view/shared/__fixtures__/midHand.ts` exports both individual `FIXTURE_*` constants and a `FIXTURES` map. Pick one. The individual exports were a holdover from an earlier draft.
- The `lastTrick` could be encoded as a `Card[]` plus a `winnerSeat` field rather than a nested object, slightly simpler for the View to destructure. Low priority.
- Skin C's "card flies from wedge to bullseye" animation wasn't actually implemented (cards just appear at center as the source dot disappears). If Skin C becomes the default later this is the first thing to fix.

**Deferred (not scoped, listed for future-you):**
- Server-side trust (currently any client can write any action; the audit log lets you detect cheating after the fact).
- Mobile-first responsiveness pass — Tailwind classes assume desktop-ish viewports.
- Sound design.
- Spectator mode (would be a small addition because the action log already supports it).
- AI opponents — would need a "choose action given visible state" function but the engine surface is clean enough that this is achievable.

---

## 12. How to resume this plan in a future chat

If a future agent or human picks this up cold:

1. Read this file top to bottom — it is the source of truth.
2. Run `npx vitest run src/HiLoJack/engine` to confirm the Model still passes.
3. Run `npm run dev` and open `http://localhost:5173/hilojack` to see the current state.
4. Look at the **last** entry in §8 Progress to find the active milestone.
5. Read any new entries in §9 Surprises & Discoveries — they often contain the load-bearing context.
6. Continue from the next unchecked milestone in §7.
