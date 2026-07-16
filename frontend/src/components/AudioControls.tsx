import { useAudio } from "../audio/AudioContext";

export function AudioControls() {
  const audio = useAudio();

  return (
    <details className="audio-controls">
      <summary className="text-button">音</summary>
      <div className="audio-panel panel">
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={audio.sfxEnabled}
            onChange={(event) => audio.setSfxEnabled(event.target.checked)}
          />
          効果音
        </label>
        <label>
          効果音量
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={audio.sfxVolume}
            disabled={!audio.sfxEnabled}
            onChange={(event) => audio.setSfxVolume(Number(event.target.value))}
          />
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={audio.bgmEnabled}
            disabled={!audio.bgmAvailable}
            onChange={(event) => audio.setBgmEnabled(event.target.checked)}
          />
          {audio.bgmAvailable ? "BGM" : "BGM（準備中）"}
        </label>
        <label>
          BGM音量
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={audio.bgmVolume}
            disabled={!audio.bgmAvailable || !audio.bgmEnabled}
            onChange={(event) => audio.setBgmVolume(Number(event.target.value))}
          />
        </label>
      </div>
    </details>
  );
}
