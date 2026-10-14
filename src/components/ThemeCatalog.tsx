import { useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { applyTheme, getTheme, themes } from "../themes";

export function ThemeCatalog({
  value,
  onApply,
}: {
  value?: string;
  onApply: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selected = getTheme(value);
  return (
    <>
      <h2>Theme catalog</h2>
      <p>
        Choose a theme to apply it instantly. Your choice is saved for this
        business and syncs to other devices when connected.
      </p>
      <p className="hint">
        Only colours and styling change. Your records, receipts and app layout
        stay the same.
      </p>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <div
        className="theme-catalog"
        aria-label="Choose an app theme"
        aria-busy={busy}
      >
        {themes.map((theme) => (
          <button
            key={theme.id}
            className="theme-option"
            disabled={busy}
            aria-pressed={selected.id === theme.id}
            aria-label={"Apply " + theme.number + ". " + theme.name}
            onClick={async () => {
              setBusy(true);
              setError("");
              applyTheme(theme.id);
              try {
                await onApply(theme.id);
              } catch (e) {
                applyTheme(selected.id);
                setError(
                  e instanceof Error
                    ? e.message
                    : "Theme could not be saved. Please retry.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <span
              className="theme-preview"
              aria-hidden="true"
              style={
                {
                  "--preview-canvas": theme.canvas,
                  "--preview-sidebar": theme.sidebar,
                  "--preview-surface": theme.surface,
                  "--preview-nav": theme.nav,
                  "--preview-primary": theme.primary,
                  "--preview-featured": theme.featured,
                  "--preview-line": theme.line,
                } as CSSProperties
              }
            >
              <span className="theme-preview-sidebar">
                <i />
                <i />
                <i />
                <i />
              </span>
              <span className="theme-preview-main">
                <span className="theme-preview-header" />
                <span className="theme-preview-action" />
                <span className="theme-preview-cards">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </span>
            </span>
            <span className="theme-option-title">
              {theme.number}. {theme.name}
            </span>
            <span className="theme-option-state">
              {selected.id === theme.id ? (
                <>
                  <Check size={15} /> Applied
                </>
              ) : (
                "Apply theme"
              )}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
