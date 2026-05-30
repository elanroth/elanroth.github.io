import type { Action, GameState, Seat } from "../../engine/types";

// The contract every skin implements. Locked in M1; future skins must consume only this.
export type SkinProps = {
  state: GameState;
  localSeat: Seat;            // which seat the local user is rendered as "south" of
  dispatch: (a: Action) => void;
  // Dev-only: when present, the skin should render a phase switcher overlay so the human
  // can flip between fixture phases without having to play a full hand.
  devPhaseSwitcher?: React.ReactNode;
};
