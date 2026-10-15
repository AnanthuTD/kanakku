import { Transaction, classify } from "../domain/model";
export function sampleTransactions(now = new Date()): Transaction[] {
  const rows: [string, number, string, string, number, boolean?][] = [
    ["Swiggy", 420, "HDFC Swiggy", "4821", 0],
    ["Rahul S", 500, "Kiwi · UPI", "2190", 0, true],
    ["Flipkart", 1299, "Axis Flipkart", "8046", 1],
    ["Third Wave Coffee", 380, "SBI Cashback", "6218", 1],
    ["Uber", 245, "Slice", "3710", 2],
    ["Lakshmi Stores", 860, "Kiwi · UPI", "2190", 2, true],
    ["BigBasket", 2340, "SBI Cashback", "6218", 3],
    ["Netflix", 649, "HDFC Swiggy", "4821", 3],
    ["Amazon", 3199, "SBI Cashback", "6218", 4],
    ["Airtel", 999, "Axis Flipkart", "8046", 4],
    ["Anand P", 1200, "Slice", "3710", 5, true],
    ["Zomato", 680, "HDFC Swiggy", "4821", 5],
    ["Myntra", 2450, "Axis Flipkart", "8046", 6],
    ["Apollo Pharmacy", 540, "SBI Cashback", "6218", 7],
    ["Blinkit", 725, "Kiwi · UPI", "2190", 8],
    ["Metro", 300, "Slice", "3710", 9],
    ["Swiggy", 560, "HDFC Swiggy", "4821", 10],
    ["Electricity", 1850, "SBI Cashback", "6218", 11],
    ["Groceries", 1320, "SBI Cashback", "6218", 12],
    ["Rent", 16000, "Slice", "3710", 12],
  ];
  const result: Transaction[] = rows.map(
    ([merchant, rupees, bank, account, days, review], i) => {
      const date = new Date(now);
      date.setDate(Math.max(1, now.getDate() - days));
      date.setHours(18 - (i % 8), 42 - i, 0, 0);
      const c = classify(merchant);
      return {
        id: `sample-${i}`,
        amount: rupees * 100,
        merchant,
        bank,
        account,
        at: date.toISOString(),
        category: review ? "Uncategorized" : c.category,
        kind: "purchase",
        review: !!review,
        excluded: false,
        note: "",
        source: "sample",
        reason: c.reason,
      };
    },
  );
  const previous = new Date(now);
  previous.setMonth(now.getMonth() - 1, Math.min(now.getDate(), 15));
  result.push({
    ...result[0],
    id: "sample-previous",
    at: previous.toISOString(),
    amount: 3100000,
    merchant: "Previous month purchases",
    review: false,
  });
  result.push({
    ...result[0],
    id: "sample-repayment",
    amount: 1200000,
    merchant: "Credit card repayment",
    kind: "card_payment",
    category: "Uncategorized",
    review: false,
  });
  return result.sort((a, b) => b.at.localeCompare(a.at));
}
