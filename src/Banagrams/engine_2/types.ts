// export type Coord = { 
//   x: number; 
//   y: number };

// export type Tile = {
//   id: string;
//   letter: string;
// };

export type Brand<K, T extends string> = K & { readonly __brand: T };

export type TileId = Brand<string, "TileId">;
export type PlayerId = Brand<string, "PlayerId">;
export type RequestId = Brand<string, "RequestId">;

export type Coord = Readonly<{ x: number; y: number }>;

export type TileLocation = "board" | "rack";

export type Tile = Readonly<{
  id: TileId;
  letter: string; // tighten later to union of "A".."Z"
  pos: Coord;     // world coords in tile units
  location: TileLocation;
  owner: PlayerId;
}>;

export type Viewport = Readonly<{
  tilePx: number;
}>;

export type DragState =
  | Readonly<{ kind: "none" }>
  | Readonly<{
      kind: "draggingTiles";
      tileIds: readonly TileId[];
      startMousePx: Coord;
      startTilePositions: Readonly<Record<TileId, Coord>>;
    }>
  | Readonly<{
      kind: "marquee";
      startMousePx: Coord;
      currentMousePx: Coord;
      mode: "replace"; // later: add | "add" | "subtract"
    }>;

export type TradeRequest = Readonly<{
  id: RequestId;
  from: PlayerId;
  want: string;
  offer?: string;
  createdAt: number;
  status: "open" | "accepted" | "cancelled" | "expired";
}>;

export type RemoteBoardSummary = Readonly<{
  playerId: PlayerId;
  // tiles: readonly Readonly<Pick<Tile, "id" | "letter" | "pos" | "location">>[];
  updatedAt: number;
}>;

export type DictionaryState =
  | Readonly<{ status: "unloaded" | "loading"; words: Set<string> }>
  | Readonly<{ status: "ready"; words: Set<string> }>
  | Readonly<{ status: "error"; words: Set<string>; error: string }>;

export type GameState = Readonly<{
  selfId: PlayerId;
  tiles: Readonly<Record<TileId, Tile>>;
  selected: Readonly<Record<TileId, true>>;
  rackOrder: readonly TileId[];
  bag: readonly string[];
  viewport: Viewport;
  drag: DragState;

  remoteBoards: Readonly<Record<PlayerId, RemoteBoardSummary>>;
  tradeRequests: Readonly<Record<RequestId, TradeRequest>>;

  dictionary: DictionaryState;
}>;

export type Action =
  | { type: "DICT_LOADING" }
  | { type: "DICT_READY"; words: Set<string> }
  | { type: "DICT_ERROR"; error: string }

  | { type: "SELECT_SET"; tileIds: TileId[] }
  | { type: "SELECT_CLEAR" }

  | { type: "MARQUEE_BEGIN"; startMousePx: Coord }
  | { type: "MARQUEE_UPDATE"; currentMousePx: Coord }
  | { type: "MARQUEE_END" }

  | { type: "DRAG_BEGIN"; tileIds: TileId[]; startMousePx: Coord }
  | { type: "DRAG_UPDATE"; currentMousePx: Coord }
  | { type: "DRAG_END" }

  | { type: "CENTER_BOARD" }

  | { type: "DUMP_SELECTED" }
  | { type: "REQUEST_TILE"; want: string; offer?: string }
  | { type: "REMOTE_BOARD_UPDATE"; board: RemoteBoardSummary };
