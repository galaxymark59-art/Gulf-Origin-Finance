import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useText } from "../i18n";
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useText();
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-label={title}>
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon"
          onClick={onClose}
          aria-label={t("Close", "إغلاق")}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark">GO</div>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
