import {
  FileText,
  PackageOpen,
  Wallet,
  Landmark,
  Users,
  Settings,
  ChevronRight,
} from "lucide-react";
import type { State } from "../domain";
import { can } from "../finance";

const dailySections = [
  {
    id: "invoices",
    title: "Goods supplied",
    detail: "Add an invoice for goods sold to a merchant.",
    icon: FileText,
  },
  {
    id: "returns",
    title: "Goods returned",
    detail: "Enter returned goods to reduce what the merchant owes.",
    icon: PackageOpen,
  },
  {
    id: "cash",
    title: "Cash & expenses",
    detail: "Add expenses and purchases, or check the cash you hold.",
    icon: Wallet,
  },
  {
    id: "savings",
    title: "Savings",
    detail: "See money in the locker. Add money or take money out.",
    icon: Landmark,
  },
];

export function More({
  state,
  onOpen,
}: {
  state: State;
  onOpen: (page: string) => void;
}) {
  const groups = [
    { title: "Daily work", sections: dailySections },
    {
      title: "Manage the app",
      sections: [
        ...(can(state.member, "manage_users")
          ? [
              {
                id: "users",
                title: "People & access",
                detail: "Add your team and choose what each person can do.",
                icon: Users,
              },
            ]
          : []),
        {
          id: "settings",
          title: "Settings",
          detail: "Business details, app lock, alerts and backups.",
          icon: Settings,
        },
      ],
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR DAILY TOOLS</p>
          <h1>More</h1>
          <p>
            Choose what you want to do. Each section explains the next step.
          </p>
        </div>
      </div>
      {groups.map((group) => (
        <section
          className="more-section"
          key={group.title}
          aria-label={group.title}
        >
          <h2>{group.title}</h2>
          <div className="more-grid">
            {group.sections.map(({ id, title, detail, icon: Icon }) => (
              <button className="more-link" key={id} onClick={() => onOpen(id)}>
                <span className="more-icon">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <span className="more-copy">
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </span>
                <ChevronRight
                  className="more-arrow"
                  size={19}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
