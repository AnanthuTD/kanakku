import { expect, it } from "vitest";
import { receiptErrorsAfterItemRemoval } from "./receiptEditing";
it("retains total and date validation failures after removing an unrelated item", () => {
  expect(
    receiptErrorsAfterItemRemoval(
      {
        totalPaise: "Malformed total",
        date: "Invalid date",
        name0: "Missing name",
        amount1: "Bad amount",
      },
      0,
    ),
  ).toEqual({
    totalPaise: "Malformed total",
    date: "Invalid date",
    amount0: "Bad amount",
  });
});
it("preserves earlier row failures and remaps only later row failures", () => {
  expect(
    receiptErrorsAfterItemRemoval(
      {
        qty0: "Bad quantity",
        price1: "Bad rate",
        name2: "Missing name",
        amount3: "Bad amount",
      },
      1,
    ),
  ).toEqual({
    qty0: "Bad quantity",
    name1: "Missing name",
    amount2: "Bad amount",
  });
});
it("clears only the deleted row's errors, allowing a corrected editor to become valid", () => {
  expect(
    receiptErrorsAfterItemRemoval(
      { name0: "Missing name", qty0: "Bad quantity" },
      0,
    ),
  ).toEqual({});
});
