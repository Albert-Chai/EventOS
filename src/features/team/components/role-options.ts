import { ROLE_LIST } from "@/server/authz/roles";

/** Serializable role option passed from server pages to client components. */
export type RoleOption = { key: string; name: string; description: string };

export const ROLE_OPTIONS: RoleOption[] = ROLE_LIST.map((role) => ({
  key: role.key,
  name: role.name,
  description: role.description,
}));
