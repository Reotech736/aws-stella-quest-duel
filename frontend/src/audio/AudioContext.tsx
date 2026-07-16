import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

export type SoundEffect =
  | "select"
  | "confirm"
  | "turn"
  | "round"
  | "lightLost"
  | "gameEnd";

interface AudioSettings {
  readonly sfxEnabled: boolean;
  readonly sfxVolume: number;
  readonly bgmEnabled: boolean;
  readonly bgmVolume: number;
}

interface AudioValue extends AudioSettings {
  readonly bgmAvailable: boolean;
  readonly setSfxEnabled: (enabled: boolean) => void;
  readonly setSfxVolume: (volume: number) => void;
  readonly setBgmEnabled: (enabled: boolean) => void;
  readonly setBgmVolume: (volume: number) => void;
  readonly playSfx: (effect: SoundEffect) => void;
}

const storageKey = "stella-quest-duel.audio";
const bgmSource = import.meta.env.VITE_BGM_URL ?? "";
const defaultSettings: AudioSettings = {
  sfxEnabled: false,
  sfxVolume: 0.45,
  bgmEnabled: false,
  bgmVolume: 0.25,
};

const AudioSettingsContext = createContext<AudioValue>({
  ...defaultSettings,
  bgmAvailable: false,
  setSfxEnabled: () => undefined,
  setSfxVolume: () => undefined,
  setBgmEnabled: () => undefined,
  setBgmVolume: () => undefined,
  playSfx: () => undefined,
});

function loadSettings(): AudioSettings {
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === null) return defaultSettings;
    return { ...defaultSettings, ...(JSON.parse(saved) as Partial<AudioSettings>) };
  } catch {
    return defaultSettings;
  }
}

const tones: Readonly<
  Record<SoundEffect, readonly [number, number, OscillatorType]>
> = {
  select: [660, 0.055, "square"],
  confirm: [880, 0.09, "square"],
  turn: [523.25, 0.16, "triangle"],
  round: [392, 0.22, "triangle"],
  lightLost: [196, 0.24, "sawtooth"],
  gameEnd: [783.99, 0.36, "triangle"],
};

export function AudioProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState(loadSettings);
  const audioContextRef = useRef<AudioContext | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (bgmSource === "") return;
    const audio = new Audio(bgmSource);
    audio.loop = true;
    bgmRef.current = audio;
    return () => {
      audio.pause();
      bgmRef.current = null;
    };
  }, []);

  useEffect(() => {
    const bgm = bgmRef.current;
    if (bgm === null) return;
    bgm.volume = settings.bgmVolume;
    if (settings.bgmEnabled) {
      void bgm.play().catch(() => {
        setSettings((current) => ({ ...current, bgmEnabled: false }));
      });
    } else {
      bgm.pause();
    }
  }, [settings.bgmEnabled, settings.bgmVolume]);

  const playSfx = useCallback(
    (effect: SoundEffect) => {
      if (!settings.sfxEnabled) return;
      const AudioContextConstructor =
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioContextConstructor === undefined) return;

      const context =
        audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = context;
      const [frequency, duration, type] = tones[effect];
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(settings.sfxVolume * 0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    },
    [settings.sfxEnabled, settings.sfxVolume],
  );

  const value = useMemo<AudioValue>(
    () => ({
      ...settings,
      bgmAvailable: bgmSource !== "",
      setSfxEnabled: (sfxEnabled) =>
        setSettings((current) => ({ ...current, sfxEnabled })),
      setSfxVolume: (sfxVolume) =>
        setSettings((current) => ({ ...current, sfxVolume })),
      setBgmEnabled: (bgmEnabled) =>
        setSettings((current) => ({ ...current, bgmEnabled })),
      setBgmVolume: (bgmVolume) =>
        setSettings((current) => ({ ...current, bgmVolume })),
      playSfx,
    }),
    [playSfx, settings],
  );

  return (
    <AudioSettingsContext.Provider value={value}>
      {children}
    </AudioSettingsContext.Provider>
  );
}

// 音響状態とProviderを同じモジュールに閉じ、再生APIを一箇所に保つ。
// eslint-disable-next-line react-refresh/only-export-components
export function useAudio(): AudioValue {
  return useContext(AudioSettingsContext);
}
