import { Transaction } from "./model";
import { dateKey } from "./ledger";
const protectedRow = (t: Transaction) =>
  t.classification?.method === "user" ||
  !!t.note ||
  !!t.receipt ||
  t.excluded ||
  !!t.duplicateOf;
const sameValue = (a: Transaction, b: Transaction) =>
  (a.amount === b.amount && (a.currency || "INR") === (b.currency || "INR")) ||
  (!!a.currency &&
    a.currency !== "INR" &&
    !!a.inrAmount &&
    (!b.currency || b.currency === "INR") &&
    a.inrAmount === b.amount);
/** Retain observations/user decisions. Exact reference + issuer/card/value proves a link.
 * Foreign alerts can be compared against an explicitly recorded INR settlement; no FX is guessed. */
export function reconcileEmailAlerts(rows: Transaction[]): Transaction[] {
  const patches = new Map<string, Transaction>();
  for (const email of rows.filter(
    (t) =>
      t.source === "email" &&
      !t.duplicateOf &&
      !t.excluded &&
      t.reconciliationDecision !== "distinct",
  )) {
    const matches = rows.filter(
      (t) =>
        t.source === "sms" &&
        !t.duplicateOf &&
        !t.excluded &&
        t.reconciliationDecision !== "distinct" &&
        t.bank === email.bank &&
        !!t.account &&
        t.account === email.account &&
        t.kind === email.kind &&
        !(t.reference && email.reference && t.reference !== email.reference),
    );
    const exact = matches.filter(
      (t) =>
        !!email.reference &&
        t.reference === email.reference &&
        sameValue(email, t),
    );
    if (exact.length === 1) {
      const sms = exact[0];
      const duplicate = !protectedRow(email)
        ? email
        : !protectedRow(sms)
          ? sms
          : null;
      const target = duplicate?.id === email.id ? sms : email;
      const competitors = rows.filter(
        (t) =>
          t.id !== email.id &&
          t.source === "email" &&
          !t.duplicateOf &&
          !t.excluded &&
          t.bank === email.bank &&
          t.account === email.account &&
          t.amount === email.amount &&
          t.reference === email.reference &&
          (t.currency || "INR") === (email.currency || "INR") &&
          t.kind === email.kind,
      );
      if (
        duplicate &&
        !competitors.length &&
        !patches.has(duplicate.id) &&
        !patches.has(target.id)
      ) {
        patches.set(duplicate.id, {
          ...duplicate,
          duplicateOf: target.id,
          excluded: true,
          review: false,
          emailMatchCandidates: undefined,
          reason: "Same payment confirmed by bank transaction reference",
        });
        continue;
      }
    }
    const possible = matches.filter(
      (t) =>
        dateKey(t.transactionAt || t.at) ===
          dateKey(email.transactionAt || email.at) &&
        (sameValue(email, t) ||
          (!!email.currency &&
            email.currency !== "INR" &&
            (!t.currency || t.currency === "INR"))),
    );
    if (!possible.length) continue;
    if (!protectedRow(email) && !email.emailMatchCandidates?.length) {
      patches.set(email.id, {
        ...email,
        emailMatchCandidates: possible.map((t) => t.id),
        review: true,
        reason: "Possible bank-alert match — resolve before counting",
      });
    } else if (protectedRow(email) && !email.emailMatchCandidates?.length) {
      // Preserve a confirmed primary payment. Only a new untouched SMS may be held for it.
      const primaryCounts =
        !email.currency || email.currency === "INR" || !!email.inrAmount;
      if (primaryCounts)
        for (const sms of possible) {
          if (
            !protectedRow(sms) &&
            !sms.emailMatchCandidates?.length &&
            !patches.has(sms.id)
          )
            patches.set(sms.id, {
              ...sms,
              emailMatchCandidates: [email.id],
              review: true,
              reason: "Possible bank-alert match — resolve before counting",
            });
        }
      else if (email.review)
        patches.set(email.id, {
          ...email,
          emailMatchCandidates: possible.map((t) => t.id),
        });
    }
  }
  return patches.size ? rows.map((t) => patches.get(t.id) || t) : rows;
}
