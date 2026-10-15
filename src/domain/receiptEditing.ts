/** Removing one bill row must not discard errors on totals/dates or on the surviving rows. */
export function receiptErrorsAfterItemRemoval(
  errors: Record<string, string>,
  removed: number,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, message] of Object.entries(errors)) {
    const row = /^(name|qty|price|amount)(\d+)$/.exec(key);
    if (!row) result[key] = message;
    else if (+row[2] !== removed)
      result[`${row[1]}${+row[2] > removed ? +row[2] - 1 : +row[2]}`] = message;
  }
  return result;
}
