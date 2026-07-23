interface Props {
  onLocal: () => void;
  onOnline: () => void;
}

export default function Landing({ onLocal, onOnline }: Props) {
  return (
    <div className="landing">
      <h1>⚽ FPL Snake Draft</h1>
      <p className="muted">How do you want to run your draft?</p>
      <div className="mode-cards">
        <button className="mode-card" onClick={onLocal}>
          <span className="mode-emoji">💻</span>
          <span className="mode-title">Local draft</span>
          <span className="mode-desc">
            One screen, one machine. Everyone drafts from the same computer —
            simplest for an in-person draft night.
          </span>
        </button>
        <button className="mode-card" onClick={onOnline}>
          <span className="mode-emoji">🌐</span>
          <span className="mode-title">Online draft</span>
          <span className="mode-desc">
            Create a room, share the code, and everyone drafts live from their
            own device — picks sync in real time.
          </span>
        </button>
      </div>
    </div>
  );
}
