import { useMemo, useState } from "react";
import { Lobby } from "./Lobby";
import { useGame } from "./controller/useGame";
import { getOrCreateUid, getStoredNickname } from "./controller/identity";
import { SkinPicker, useSkin, type SkinId } from "./view/SkinPicker";
import SkinA from "./view/SkinA_Realistic";
import SkinB from "./view/SkinB_TopDownMinimal";
import SkinC from "./view/SkinC_AbstractSuitRadar";
import { PhaseSwitcher } from "./view/shared/PhaseSwitcher";
import { FIXTURES, type FixturePhase } from "./view/shared/__fixtures__/midHand";
import { deriveBotSeats, useBotDriver } from "./bot/useBotDriver";

const SKINS: Record<SkinId, React.ComponentType<any>> = {
  A: SkinA,
  B: SkinB,
  C: SkinC,
};

export function HiLoJackApp() {
  const uid = useMemo(() => getOrCreateUid(), []);
  const initialNick = useMemo(() => getStoredNickname(), []);
  const [gameId, setGameId] = useState<string | null>(null);
  const [skin, setSkin] = useSkin();
  const [fixturePhase, setFixturePhase] = useState<FixturePhase>("playing");

  const isDev = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("hjdev") === "1";
  }, []);

  const game = useGame(gameId, uid);
  const SkinView = SKINS[skin];

  // Only the HOST drives bots — otherwise multiple tabs would race on bot
  // dispatch. The hostUid lives on /meta and is the uid that called createGame.
  const isHost = !!(game.meta && game.meta.hostUid === uid);
  const botSeats = useMemo(
    () => (isHost && gameId ? deriveBotSeats(game.state.players, gameId) : new Set<never>()),
    [isHost, gameId, game.state.players],
  );
  useBotDriver(game, botSeats as Set<any>);

  // Dev mode: feed the chosen skin a fixture and a phase switcher.
  if (isDev) {
    return (
      <div className="relative w-full h-screen overflow-hidden">
        <SkinPicker value={skin} onChange={setSkin} />
        <SkinView
          state={FIXTURES[fixturePhase]}
          localSeat="S"
          dispatch={() => {}}
          devPhaseSwitcher={
            <PhaseSwitcher current={fixturePhase} onChange={setFixturePhase} />
          }
        />
      </div>
    );
  }

  // Live mode: lobby until seated AND past the lobby phase, then the skin.
  if (game.localSeat && game.state.phase.kind !== "lobby") {
    return (
      <div className="relative w-full h-screen overflow-hidden">
        <SkinPicker value={skin} onChange={setSkin} />
        <SkinView
          state={game.state}
          localSeat={game.localSeat}
          dispatch={game.dispatch}
        />
      </div>
    );
  }

  return (
    <>
      <SkinPicker value={skin} onChange={setSkin} />
      <Lobby
        uid={uid}
        initialNick={initialNick}
        gameId={gameId}
        setGameId={setGameId}
        game={game}
      />
    </>
  );
}
