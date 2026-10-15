// A restart must not discard an open payment draft, even if Settings is opened by a link.
const active = new Set<symbol>();
export function beginInteraction() {
  const token = Symbol("payment-draft");
  active.add(token);
  return () => {
    active.delete(token);
  };
}
export const hasPendingInteractions = () => active.size > 0;
