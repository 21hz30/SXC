/**
 * Helpers for identifying a customer by more than just their name.
 *
 * Names can repeat (two "Alex Chen"s), so anywhere we let a coach pick or
 * recognize a customer we append distinguishing details — division and a
 * contact handle (phone preferred, else email). Phone is also enforced as a
 * unique handle at creation time (see the customers page create action).
 */
import { divisionLabel } from "./benchmarks";

export type CustomerLike = {
  name: string;
  division?: string | null;
  phone?: string | null;
  email?: string | null;
  tags?: string | null;
};

/** Short descriptor WITHOUT the name, e.g. "Pro · +1 555-1234". Empty if nothing to add. */
export function customerDetail(c: CustomerLike): string {
  const parts: string[] = [];
  if (c.division) parts.push(divisionLabel(c.division));
  if (c.phone) parts.push(c.phone);
  else if (c.email) parts.push(c.email);
  return parts.join(" · ");
}

/** Full single-line label for pickers, e.g. "Alex Chen — Pro · +1 555-1234". */
export function customerOptionLabel(c: CustomerLike): string {
  const d = customerDetail(c);
  return d ? `${c.name} — ${d}` : c.name;
}
