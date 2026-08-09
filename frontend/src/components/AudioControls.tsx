import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAudio } from "../audio/AudioContext";

export function AudioControls() {
  const audio = useAudio();
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  return (
    <div className="audio-controls">
      <button type="button" className="text-button" onClick={() => setOpen(true)}>
        音設定
      </button>
      {open && createPortal(
        <div className="dialog-backdrop" onMouseDown={() => setOpen(false)}>
          <section
            ref={dialogRef}
            className="audio-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audio-settings-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="dialog-header">
              <h2 id="audio-settings-title">音設定</h2>
              <button
                ref={closeButtonRef}
                type="button"
                className="text-button"
                aria-label="音設定を閉じる"
                onClick={() => setOpen(false)}
              >
                閉じる
              </button>
            </header>
            <div className="audio-panel">
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
                  onChange={(event) =>
                    audio.setSfxVolume(Number(event.target.value))
                  }
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
                  onChange={(event) =>
                    audio.setBgmVolume(Number(event.target.value))
                  }
                />
              </label>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
