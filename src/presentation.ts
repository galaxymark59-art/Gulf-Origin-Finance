import type { Member, State } from "./domain";

// Display names do not change account roles, access checks or issued receipts.
export function personName(state: State, id = state.member?.id): string {
  const member =
    state.members.find((person) => person.id === id) ||
    (state.member?.id === id ? state.member : null);
  const name = member?.name.trim();
  if (id === state.businessOwner && (!name || /^owner$/i.test(name)))
    return "Ahmed Marwan";
  return name || "Team member";
}

export function personRole(state: State, member: Member): string {
  if (member.id === state.businessOwner) return "Creator";
  return member.role === "owner"
    ? "Administrator"
    : member.role === "collector"
      ? "Collector"
      : "Viewer";
}

export function personLabel(state: State, member = state.member): string {
  return member
    ? `${personName(state, member.id)} (${personRole(state, member)})`
    : "Checking account";
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (
    words.length > 1
      ? words[0][0] + words[words.length - 1][0]
      : name.slice(0, 2)
  ).toUpperCase();
}
