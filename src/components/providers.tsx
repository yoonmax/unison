"use client";

import { MotionConfig } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SoundEngine, type SoundName } from "@/lib/client/sound";

interface SoundContextValue {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  play: (name: SoundName, voices?: number) => void;
}

const SoundContext = createContext<SoundContextValue>({
  enabled: false,
  setEnabled: () => {},
  play: () => {},
});

export function useSound() {
  return useContext(SoundContext);
}

function SoundProvider({ children }: { children: ReactNode }) {
  const engineRef = useRef<SoundEngine | null>(null);
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    const engine = new SoundEngine();
    engineRef.current = engine;
    // Reading the stored preference has to wait for the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabledState(engine.isEnabled);
    // Audio may only start after a gesture (browser autoplay policy).
    const unlock = () => engine.unlock();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    engineRef.current?.setEnabled(value);
    setEnabledState(value);
  }, []);

  const play = useCallback((name: SoundName, voices?: number) => {
    engineRef.current?.play(name, voices);
  }, []);

  const value = useMemo(() => ({ enabled, setEnabled, play }), [enabled, setEnabled, play]);
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <SoundProvider>{children}</SoundProvider>
    </MotionConfig>
  );
}
