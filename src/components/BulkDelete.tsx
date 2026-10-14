import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "./Common";

export function useBulkDelete(
  items: { id: string; label: string }[],
  onDelete?: (ids: string[]) => Promise<unknown>,
  noun = "records",
) {
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<string[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const available = new Set(items.map((item) => item.id));
  const chosen = selected.filter((id) => available.has(id));
  const checkbox = (id: string) =>
    onDelete && available.has(id) ? (
      <input
        className="record-checkbox"
        type="checkbox"
        aria-label={"Select " + items.find((item) => item.id === id)?.label}
        checked={chosen.includes(id)}
        onChange={(e) =>
          setSelected((previous) =>
            e.target.checked
              ? [...new Set([...previous, id])]
              : previous.filter((value) => value !== id),
          )
        }
      />
    ) : null;
  const toolbar = onDelete ? (
    <>
      <div
        className="selection-toolbar"
        role="group"
        aria-label={"Select and delete " + noun}
      >
        <button
          className="secondary"
          disabled={!items.length || busy}
          onClick={() => setSelected(items.map((item) => item.id))}
        >
          Select all ({items.length})
        </button>
        <span>{chosen.length} selected</span>
        {chosen.length > 0 && (
          <button className="link" onClick={() => setSelected([])}>
            Clear selection
          </button>
        )}
        <button
          className="secondary danger"
          disabled={!chosen.length || busy}
          onClick={() => {
            setError("");
            setConfirm(chosen);
          }}
        >
          <Trash2 size={16} />
          Delete selected
        </button>
        <button
          className="link danger"
          disabled={!items.length || busy}
          onClick={() => {
            setError("");
            setConfirm(items.map((item) => item.id));
          }}
        >
          Delete all ({items.length})
        </button>
      </div>
      {confirm && (
        <Modal
          title={"Delete " + confirm.length + " " + noun + "?"}
          required={busy}
          onClose={() => setConfirm(undefined)}
        >
          <p>
            {noun === "merchants"
              ? "These merchants will move to Deleted merchants. Their saved history is kept, and you can restore them there."
              : "These entries will be removed from the active list and totals. Their balance changes are cancelled, with copies kept in Deleted entries. Any goods returns linked to selected invoices are included."}
          </p>
          <p className="hint">
            Select all covers every matching record, including other pages of
            this list.
          </p>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setConfirm(undefined)}
            >
              Cancel
            </button>
            <button
              className="primary danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await onDelete(confirm.filter((id) => available.has(id)));
                  setSelected([]);
                  setConfirm(undefined);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Unable to delete. Please retry.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Deleting…" : "Delete " + confirm.length + " " + noun}
            </button>
          </div>
        </Modal>
      )}
    </>
  ) : null;
  return { checkbox, toolbar };
}
