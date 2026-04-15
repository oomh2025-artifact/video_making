interface Props {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
}

export default function PlaybackControls({ currentTime, duration, isPlaying, onTogglePlay, onSeek }: Props) {
  const formatTime = (t: number) => {
    const s = Math.max(0, t);
    return `${s.toFixed(1)}s`;
  };

  return (
    <div className="playback-controls">
      <button className="play-btn" onClick={onTogglePlay}>
        {isPlaying ? "⏸" : "▶"}
      </button>
      <input
        type="range"
        className="time-slider"
        min={0}
        max={duration}
        step={0.05}
        value={currentTime}
        onChange={(e) => onSeek(parseFloat(e.target.value))}
      />
      <span className="time-display">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
}
