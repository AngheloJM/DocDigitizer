import { ROLE_LABEL, type Role } from "@/lib/types";

const toneByRole: Record<Role, string> = {
  student: "bg-surface-container text-on-surface-variant",
  admin: "bg-primary/10 text-primary",
  super_admin: "bg-secondary-container text-on-secondary",
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex items-center rounded-2xl px-2.5 py-1 text-xs font-medium ${toneByRole[role] ?? "bg-surface-container text-on-surface-variant"}`}
    >
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}
