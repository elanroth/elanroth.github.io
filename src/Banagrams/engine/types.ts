// src/engine/types.ts

// ---------- Core geometry ----------
export type Coord = { x: number; y: number };

// ---------- ID aliases (upgrade to branded IDs later if you want) ----------
export type TileId = string;
export type PlayerId = string;
export type RequestId = string;

// ---------- Tiles ----------
export type Tile = {
  id: TileId;
  letter: string;
};

export type TileLocation = "board" | "rack";

export type TileState = {
  id: TileId;
  letter: string;
  pos: Coord;              // world coords (tile units), can be non-integer while dragging
  location: TileLocation;
  owner: PlayerId;
};

export type TilesById = Record<TileId, TileState>;

// ---------- Selection ----------
export type Selection = Record<TileId, true>; // serializable alternative to Set<TileId>

// ---------- Dragging ----------
export type DragState =
  | { kind: "none" }
  | {
      kind: "dragging";
      tileIds: TileId[];
      startMouse: Coord;                      // screen coords (px)
      startPositions: Record<TileId, Coord>;  // world coords
    }
  | {
      kind: "marquee";
      startMouse: Coord;                      // screen coords (px)
      currentMouse: Coord;                    // screen coords (px)
    };

// ---------- Dictionary ----------
export type DictionaryState =
  | { status: "unloaded" | "loading"; words: null }
  | { status: "ready"; words: Set<string> }
  | { status: "error"; words: null; error: string };

// ---------- Requests / multiplayer ----------
export type TileRequest = {
  id: RequestId;
  from: PlayerId;
  want: string;            // e.g. "E"
  offer?: string;          // optional 1-for-1
  createdAt: number;
  status: "open" | "accepted" | "rejected";
};

export type RemoteBoard = {
  playerId: PlayerId;
  tiles: Array<{
    id: TileId;
    letter: string;
    pos: Coord;
  }>;
  updatedAt: number;
};

// ---------- Game state ----------
export type GameState = {
  selfId: PlayerId;

  tiles: TilesById;

  rack: TileId[];          // ordering matters
  selection: Selection;
  drag: DragState;

  bag: string[];

  dictionary: DictionaryState;

  requests: Record<RequestId, TileRequest>;
  remoteBoards: Record<PlayerId, RemoteBoard>;
};

// ---------- Actions ----------
export type Action =
  | { type: "SELECT_SET"; tileIds: TileId[] }
  | { type: "SELECT_CLEAR" }

  | { type: "DRAW"; count: number }

  | { type: "PLACE_TILE"; tileId: TileId; pos: Coord }
  | { type: "MOVE_TILE"; tileId: TileId; pos: Coord }

  | { type: "DRAG_BEGIN"; tileIds: TileId[]; mouse: Coord }
  | { type: "DRAG_UPDATE"; mouse: Coord }
  | { type: "DRAG_END" }

  | { type: "MARQUEE_BEGIN"; mouse: Coord }
  | { type: "MARQUEE_UPDATE"; mouse: Coord }
  | { type: "MARQUEE_END" }

  | { type: "CENTER_BOARD" }
  | { type: "DUMP_SELECTED" }
  | { type: "DUMP_TILE"; tileId: TileId }


  | { type: "REQUEST_TILE"; want: string; offer?: string }
  | { type: "REQUEST_RESOLVE"; requestId: RequestId; accept: boolean }

  | { type: "DICT_READY"; words: Set<string> }
  | { type: "DICT_ERROR"; error: string;
    };
