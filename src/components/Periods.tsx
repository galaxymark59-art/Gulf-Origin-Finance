import { day } from "../domain";
export function Periods({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const today = day(new Date().toISOString());
  function preset(value: string) {
    const d = new Date(today + "T12:00:00+03:00");
    if (value === "week")
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7));
    if (value === "month") d.setUTCDate(1);
    onChange(day(d.toISOString()), today);
  }
  return (
    <>
      <div className="periods">
        {[
          ["today", "Today"],
          ["week", "This week"],
          ["month", "This month"],
        ].map(([v, label]) => (
          <button
            type="button"
            key={v}
            className="secondary"
            onClick={() => preset(v)}
          >
            {label}
          </button>
        ))}
        <span className="hint">Or choose custom dates · Riyadh time</span>
      </div>
      <div className="toolbar">
        <label>
          From
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => onChange(e.target.value, to)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => onChange(from, e.target.value)}
          />
        </label>
      </div>
    </>
  );
}
