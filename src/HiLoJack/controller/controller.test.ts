import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Action, GameState, Seat } from "../engine/types";
import { initialState, reducer } from "../engine/reducer";

// ---------- In-memory Firebase mock ----------
// Mimics just enough of firebase/database to exercise createGame / claimSeat /
// pushAction / subscribeActions / subscribeMeta / subscribePlayers.
type Snap = { val: () => any; exists: () => boolean };
type Listener = (snap: Snap) => void;
type ChildListener = (snap: Snap, prevKey: string | null) => void;

class FakeDB {
  data: Record<string, any> = {};
  valueListeners = new Map<string, Set<Listener>>();
  childAddedListeners = new Map<string, Set<ChildListener>>();

  private getPath(path: string): any {
    const parts = path.split("/").filter(Boolean);
    let node: any = this.data;
    for (const p of parts) {
      if (node == null) return null;
      node = node[p];
    }
    return node ?? null;
  }

  private setPath(path: string, value: any): void {
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) {
      this.data = value ?? {};
      return;
    }
    let node: any = this.data;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = {};
      node = node[parts[i]];
    }
    if (value === null) delete node[parts[parts.length - 1]];
    else node[parts[parts.length - 1]] = value;
  }

  private snap(value: any): Snap {
    return { val: () => value, exists: () => value != null };
  }

  async get(path: string) {
    return this.snap(this.getPath(path));
  }

  async set(path: string, value: any) {
    this.detectUndefined(value, path);
    this.setPath(path, value);
    this.fireValue(path);
    // value writes also need to notify parent's child_added if it's a new child
    const parentPath = path.split("/").slice(0, -1).join("/");
    const key = path.split("/").slice(-1)[0];
    this.fireChildAdded(parentPath, key, value);
  }

  async push(path: string, value: any) {
    this.detectUndefined(value, path);
    const key = `-N${Math.random().toString(36).slice(2, 10)}`;
    const childPath = `${path}/${key}`;
    this.setPath(childPath, value);
    this.fireValue(childPath);
    this.fireChildAdded(path, key, value);
    return { key };
  }

  async runTransaction(path: string, fn: (curr: any) => any) {
    const curr = this.getPath(path);
    const result = fn(curr);
    if (result === undefined) return { committed: false };
    this.detectUndefined(result, path);
    this.setPath(path, result);
    this.fireValue(path);
    return { committed: true };
  }

  onValue(path: string, cb: Listener): () => void {
    if (!this.valueListeners.has(path)) this.valueListeners.set(path, new Set());
    this.valueListeners.get(path)!.add(cb);
    // initial fire
    cb(this.snap(this.getPath(path)));
    return () => this.valueListeners.get(path)?.delete(cb);
  }

  onChildAdded(path: string, cb: ChildListener): () => void {
    if (!this.childAddedListeners.has(path)) this.childAddedListeners.set(path, new Set());
    this.childAddedListeners.get(path)!.add(cb);
    // replay existing children
    const existing = this.getPath(path) ?? {};
    for (const key of Object.keys(existing)) {
      cb(this.snap(existing[key]), null);
    }
    return () => this.childAddedListeners.get(path)?.delete(cb);
  }

  private fireValue(path: string) {
    // walk up to fire any ancestor listeners
    const parts = path.split("/").filter(Boolean);
    for (let i = 0; i <= parts.length; i++) {
      const p = parts.slice(0, i).join("/");
      const ls = this.valueListeners.get(p);
      if (ls) {
        const snap = this.snap(this.getPath(p));
        for (const l of ls) l(snap);
      }
    }
  }

  private fireChildAdded(parentPath: string, key: string, value: any) {
    const ls = this.childAddedListeners.get(parentPath);
    if (!ls) return;
    const snap = this.snap(value);
    for (const l of ls) l(snap, null);
  }

  private detectUndefined(value: any, path: string) {
    if (value === undefined) throw new Error(`[fake-rtdb] undefined at ${path}`);
    if (value === null) return;
    if (typeof value !== "object") return;
    for (const k of Object.keys(value)) {
      if (value[k] === undefined) {
        throw new Error(`[fake-rtdb] undefined at ${path}/${k}`);
      }
      if (typeof value[k] === "object" && value[k] !== null) {
        this.detectUndefined(value[k], `${path}/${k}`);
      }
    }
  }
}

let FAKE: FakeDB;

vi.mock("./firebase", () => ({ db: {} as any }));

vi.mock("firebase/database", () => ({
  ref: (_db: any, path: string) => ({ __path: path } as any),
  get: (r: any) => FAKE.get(r.__path),
  set: (r: any, v: any) => FAKE.set(r.__path, v),
  push: (r: any, v: any) => FAKE.push(r.__path, v),
  runTransaction: (r: any, fn: any) => FAKE.runTransaction(r.__path, fn),
  onValue: (r: any, cb: Listener) => FAKE.onValue(r.__path, cb),
  onChildAdded: (r: any, cb: ChildListener) => FAKE.onChildAdded(r.__path, cb),
  off: () => {},
}));

// import AFTER the mocks
import {
  claimSeat, createGame, getMeta, pushAction,
  subscribeActions, subscribeMeta, subscribePlayers,
} from "./rtdb";

beforeEach(() => {
  FAKE = new FakeDB();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------- Tests ----------

describe("createGame", () => {
  it("creates a 6-char id and a meta record without undefined fields", async () => {
    const id = await createGame({ hostUid: "uA", nickname: "Alice", targetScore: 21 });
    expect(id).toMatch(/^[A-Z2-9]{6}$/);
    const m = await getMeta(id);
    expect(m).toBeTruthy();
    expect(m!.gameId).toBe(id);
    expect(m!.targetScore).toBe(21);
    expect(m!.randomSeed).toBeGreaterThan(0);
    // critical: no undefined slipped through (FakeDB would have thrown if it did)
  });

  it("accepts a lobbyName when provided", async () => {
    const id = await createGame({
      hostUid: "uA", nickname: "Alice", targetScore: 21, lobbyName: "friday game",
    });
    const m = await getMeta(id);
    expect(m?.lobbyName).toBe("friday game");
  });

  it("omits lobbyName when not provided (does not write undefined)", async () => {
    const id = await createGame({ hostUid: "uA", nickname: "Alice", targetScore: 11 });
    const m = await getMeta(id);
    // Should be defined-or-absent, never the literal undefined that crashes RTDB
    expect("lobbyName" in (m as any) ? m!.lobbyName : null).not.toBe(undefined);
  });
});

describe("claimSeat", () => {
  let gameId: string;
  beforeEach(async () => {
    gameId = await createGame({ hostUid: "uA", nickname: "Alice", targetScore: 21 });
  });

  it("first claim wins atomically", async () => {
    const a = await claimSeat(gameId, "N", "uA", "Alice");
    expect(a).toBe(true);
  });

  it("second claim by a different uid is rejected", async () => {
    await claimSeat(gameId, "N", "uA", "Alice");
    const b = await claimSeat(gameId, "N", "uB", "Bob");
    expect(b).toBe(false);
  });

  it("re-claim by the same uid is idempotent (still committed)", async () => {
    await claimSeat(gameId, "N", "uA", "Alice");
    const again = await claimSeat(gameId, "N", "uA", "Alice");
    expect(again).toBe(true);
  });
});

describe("subscribeActions: replay + live updates", () => {
  let gameId: string;
  beforeEach(async () => {
    gameId = await createGame({ hostUid: "uA", nickname: "Alice", targetScore: 21 });
  });

  it("replays already-pushed actions to a new subscriber, in order", async () => {
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "N", uid: "uA", nickname: "A" });
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "E", uid: "uB", nickname: "B" });
    const seen: Action[] = [];
    subscribeActions(gameId, (a) => seen.push(a));
    expect(seen.length).toBe(2);
    expect(seen[0].type).toBe("JOIN_SEAT");
    expect((seen[0] as any).seat).toBe("N");
    expect((seen[1] as any).seat).toBe("E");
  });

  it("delivers new actions to existing subscribers", async () => {
    const seen: Action[] = [];
    subscribeActions(gameId, (a) => seen.push(a));
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "S", uid: "uS", nickname: "Sam" });
    expect(seen.length).toBe(1);
    expect((seen[0] as any).seat).toBe("S");
  });
});

// ---------- End-to-end lobby + first-hand convergence ----------

describe("4-client lobby flow converges to identical state", () => {
  it("create → 4 claims → start hand → all clients in bidding with seats filled", async () => {
    const gameId = await createGame({ hostUid: "uA", nickname: "Alice", targetScore: 21 });
    const meta = (await getMeta(gameId))!;

    type Client = { uid: string; state: GameState };
    function makeClient(uid: string): Client {
      let s = initialState(gameId, meta.randomSeed);
      s = reducer(s, { type: "SET_OPTIONS", targetScore: meta.targetScore });
      subscribeActions(gameId, (a) => { s = reducer(s, a); });
      return new Proxy({ uid, get state() { return s; } } as any, {});
    }

    // Each client subscribes BEFORE any actions are pushed (so they all replay together)
    const A = makeClient("uA");
    const B = makeClient("uB");
    const C = makeClient("uC");
    const D = makeClient("uD");

    // Atomic seat claims first (via the /players transaction), then action-log JOIN_SEAT.
    expect(await claimSeat(gameId, "N", "uA", "Alice")).toBe(true);
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "N", uid: "uA", nickname: "Alice" });
    expect(await claimSeat(gameId, "E", "uB", "Bob")).toBe(true);
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "E", uid: "uB", nickname: "Bob" });
    expect(await claimSeat(gameId, "S", "uC", "Carol")).toBe(true);
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "S", uid: "uC", nickname: "Carol" });
    expect(await claimSeat(gameId, "W", "uD", "Dave")).toBe(true);
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "W", uid: "uD", nickname: "Dave" });

    // All clients should now have all 4 seats filled in their local state
    for (const cl of [A, B, C, D]) {
      expect(cl.state.players.N?.uid).toBe("uA");
      expect(cl.state.players.E?.uid).toBe("uB");
      expect(cl.state.players.S?.uid).toBe("uC");
      expect(cl.state.players.W?.uid).toBe("uD");
    }

    // Host starts the hand
    await pushAction(gameId, { type: "START_HAND" });

    // All clients should be in bidding now with identical state
    for (const cl of [A, B, C, D]) {
      expect(cl.state.phase.kind).toBe("bidding");
    }
    // Verify pairwise equality (same seed, same action sequence → same state)
    expect(JSON.stringify(A.state)).toBe(JSON.stringify(B.state));
    expect(JSON.stringify(B.state)).toBe(JSON.stringify(C.state));
    expect(JSON.stringify(C.state)).toBe(JSON.stringify(D.state));
  });

  it("a client that joins LATE replays the full action log and converges", async () => {
    const gameId = await createGame({ hostUid: "uA", nickname: "Alice", targetScore: 21 });
    const meta = (await getMeta(gameId))!;

    // Push a few actions before any subscription
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "N", uid: "uA", nickname: "Alice" });
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "E", uid: "uB", nickname: "Bob" });
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "S", uid: "uC", nickname: "Carol" });
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "W", uid: "uD", nickname: "Dave" });
    await pushAction(gameId, { type: "START_HAND" });

    let s = initialState(gameId, meta.randomSeed);
    s = reducer(s, { type: "SET_OPTIONS", targetScore: meta.targetScore });
    subscribeActions(gameId, (a) => { s = reducer(s, a); });

    expect(s.phase.kind).toBe("bidding");
    expect(s.players.N?.uid).toBe("uA");
    expect(s.players.W?.uid).toBe("uD");
  });

  it("a duplicate JOIN_SEAT for the same seat is a reducer no-op", async () => {
    const gameId = await createGame({ hostUid: "uA", nickname: "Alice", targetScore: 21 });
    const meta = (await getMeta(gameId))!;

    let s = initialState(gameId, meta.randomSeed);
    s = reducer(s, { type: "SET_OPTIONS", targetScore: meta.targetScore });
    subscribeActions(gameId, (a) => { s = reducer(s, a); });

    await pushAction(gameId, { type: "JOIN_SEAT", seat: "N", uid: "uA", nickname: "Alice" });
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "N", uid: "uHACK", nickname: "Hacker" });
    expect(s.players.N?.uid).toBe("uA");
    expect(s.players.N?.nickname).toBe("Alice");
  });

  it("START_HAND before 4 seats are filled is a reducer no-op", async () => {
    const gameId = await createGame({ hostUid: "uA", nickname: "Alice", targetScore: 21 });
    const meta = (await getMeta(gameId))!;

    let s = initialState(gameId, meta.randomSeed);
    s = reducer(s, { type: "SET_OPTIONS", targetScore: meta.targetScore });
    subscribeActions(gameId, (a) => { s = reducer(s, a); });

    await pushAction(gameId, { type: "JOIN_SEAT", seat: "N", uid: "uA", nickname: "Alice" });
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "E", uid: "uB", nickname: "Bob" });
    await pushAction(gameId, { type: "START_HAND" });

    expect(s.phase.kind).toBe("lobby");
  });
});

describe("releaseSeat", () => {
  it("releases a seat owned by the same uid", async () => {
    const { releaseSeat } = await import("./rtdb");
    const id = await createGame({ hostUid: "u", nickname: "n", targetScore: 21 });
    await claimSeat(id, "N", "uA", "Alice");
    let lastPlayers: any = null;
    subscribePlayers(id, (p) => { lastPlayers = p; });
    expect(lastPlayers.N?.uid).toBe("uA");
    await releaseSeat(id, "N", "uA");
    expect(lastPlayers.N).toBeNull();
  });

  it("does NOT release a seat owned by a different uid", async () => {
    const { releaseSeat } = await import("./rtdb");
    const id = await createGame({ hostUid: "u", nickname: "n", targetScore: 21 });
    await claimSeat(id, "N", "uA", "Alice");
    let lastPlayers: any = null;
    subscribePlayers(id, (p) => { lastPlayers = p; });
    await releaseSeat(id, "N", "uB");
    expect(lastPlayers.N?.uid).toBe("uA");
  });
});

describe("full hand flow through the action log", () => {
  it("plays a complete hand: bidding → trump → 6 tricks → scoring (state lands in scoring phase)", async () => {
    const { legalPlays } = await import("../engine/rules");
    const gameId = await createGame({ hostUid: "uA", nickname: "Alice", targetScore: 21 });
    const meta = (await getMeta(gameId))!;
    let s = initialState(gameId, meta.randomSeed);
    s = reducer(s, { type: "SET_OPTIONS", targetScore: meta.targetScore });
    subscribeActions(gameId, (a) => { s = reducer(s, a); });

    await pushAction(gameId, { type: "JOIN_SEAT", seat: "N", uid: "uA", nickname: "A" });
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "E", uid: "uB", nickname: "B" });
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "S", uid: "uC", nickname: "C" });
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "W", uid: "uD", nickname: "D" });
    await pushAction(gameId, { type: "START_HAND" });

    const nextCW: Record<Seat, Seat> = { N: "E", E: "S", S: "W", W: "N" };
    // Phase mutates via the action-log subscription, so TS narrowing across awaits is unreliable.
    // Use `any` reads at runtime — the reducer guarantees these phases are correct.
    if ((s.phase as any).kind !== "bidding") throw new Error("expected bidding");
    let cursor: Seat = (s.phase as any).turn;
    for (let i = 0; i < 4; i++) {
      const bid = cursor === s.dealerSeat ? 2 : "pass";
      await pushAction(gameId, { type: "BID", seat: cursor, bid });
      cursor = nextCW[cursor];
    }

    for (let t = 0; t < 6; t++) {
      for (let i = 0; i < 4; i++) {
        const phase: any = s.phase;
        if (phase.kind !== "playing") throw new Error("expected playing");
        const turn: Seat = phase.trick.cards.length === 0
          ? phase.trick.leader
          : nextCW[phase.trick.cards[phase.trick.cards.length - 1].seat as Seat];
        const legal = legalPlays(s.hands[turn], phase.trick.cards, phase.trump);
        await pushAction(gameId, { type: "PLAY_CARD", seat: turn, card: legal[0] });
      }
      await pushAction(gameId, { type: "RESOLVE_TRICK" });
    }
    expect(s.phase.kind).toBe("scoring");
    expect(s.hands.N.length).toBe(0);
    expect(s.hands.E.length).toBe(0);
    expect(s.hands.S.length).toBe(0);
    expect(s.hands.W.length).toBe(0);
  });

  it("after a hand, SCORE_HAND + START_HAND deals again and rotates dealer", async () => {
    const { legalPlays } = await import("../engine/rules");
    const gameId = await createGame({ hostUid: "uA", nickname: "Alice", targetScore: 21 });
    const meta = (await getMeta(gameId))!;
    let s = initialState(gameId, meta.randomSeed);
    s = reducer(s, { type: "SET_OPTIONS", targetScore: meta.targetScore });
    subscribeActions(gameId, (a) => { s = reducer(s, a); });

    await pushAction(gameId, { type: "JOIN_SEAT", seat: "N", uid: "uA", nickname: "A" });
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "E", uid: "uB", nickname: "B" });
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "S", uid: "uC", nickname: "C" });
    await pushAction(gameId, { type: "JOIN_SEAT", seat: "W", uid: "uD", nickname: "D" });
    await pushAction(gameId, { type: "START_HAND" });
    expect(s.dealerSeat).toBe("N");

    const nextCW: Record<Seat, Seat> = { N: "E", E: "S", S: "W", W: "N" };
    if ((s.phase as any).kind !== "bidding") throw new Error("expected bidding");
    let cursor: Seat = (s.phase as any).turn;
    for (let i = 0; i < 4; i++) {
      const bid = cursor === s.dealerSeat ? 2 : "pass";
      await pushAction(gameId, { type: "BID", seat: cursor, bid });
      cursor = nextCW[cursor];
    }
    for (let t = 0; t < 6; t++) {
      for (let i = 0; i < 4; i++) {
        const phase: any = s.phase;
        if (phase.kind !== "playing") throw new Error("expected playing");
        const turn: Seat = phase.trick.cards.length === 0
          ? phase.trick.leader
          : nextCW[phase.trick.cards[phase.trick.cards.length - 1].seat as Seat];
        const legal = legalPlays(s.hands[turn], phase.trick.cards, phase.trump);
        await pushAction(gameId, { type: "PLAY_CARD", seat: turn, card: legal[0] });
      }
      await pushAction(gameId, { type: "RESOLVE_TRICK" });
    }

    await pushAction(gameId, { type: "SCORE_HAND" });
    if ((s.phase as any).kind !== "scoring") throw new Error("expected scoring");
    expect((s.phase as any).applied).toBe(true);

    await pushAction(gameId, { type: "START_HAND" });
    expect((s.phase as any).kind).toBe("bidding");
    expect(s.dealerSeat).toBe("E"); // rotated CW from N
  });
});

describe("dispatch error path", () => {
  it("a malformed action that the reducer rejects leaves state unchanged", async () => {
    const gameId = await createGame({ hostUid: "uA", nickname: "Alice", targetScore: 21 });
    const meta = (await getMeta(gameId))!;
    let s = initialState(gameId, meta.randomSeed);
    s = reducer(s, { type: "SET_OPTIONS", targetScore: meta.targetScore });
    subscribeActions(gameId, (a) => { s = reducer(s, a); });

    // BID before bidding phase — reducer no-op
    await pushAction(gameId, { type: "BID", seat: "N", bid: 3 });
    expect(s.phase.kind).toBe("lobby");

    // PLAY_CARD before playing phase — reducer no-op
    await pushAction(gameId, { type: "PLAY_CARD", seat: "N", card: { suit: "S", rank: "A" } });
    expect(s.phase.kind).toBe("lobby");
  });
});

describe("subscribeMeta and subscribePlayers", () => {
  it("subscribeMeta fires with the meta value after createGame", async () => {
    const id = await createGame({ hostUid: "u", nickname: "n", targetScore: 11 });
    let received: any = null;
    subscribeMeta(id, (m) => { received = m; });
    expect(received).not.toBeNull();
    expect(received.gameId).toBe(id);
    expect(received.targetScore).toBe(11);
  });

  it("subscribePlayers reports all four seats (null when unclaimed)", async () => {
    const id = await createGame({ hostUid: "u", nickname: "n", targetScore: 21 });
    let received: any = null;
    subscribePlayers(id, (p) => { received = p; });
    expect(received).toEqual({ N: null, E: null, S: null, W: null });

    await claimSeat(id, "N", "u1", "n1");
    await claimSeat(id, "E", "u2", "n2");
    expect(received.N?.uid).toBe("u1");
    expect(received.E?.uid).toBe("u2");
    expect(received.S).toBeNull();
    expect(received.W).toBeNull();
  });
});
