import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  recognize: vi.fn(),
  state: "active",
  change: undefined as undefined | ((state: string) => void),
  remove: vi.fn(),
}));
vi.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return mock.state;
    },
    addEventListener: (_: string, callback: (state: string) => void) => {
      mock.change = callback;
      return { remove: mock.remove };
    },
  },
}));
vi.mock("./bridge", () => ({ native: { recognizeReceipt: mock.recognize } }));
import { cancelReceipt, readReceipt } from "./receipt.native";
import { readReceipt as previewReceipt } from "./receipt";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.state = "active";
  mock.recognize.mockResolvedValue({ text: "MART\nMilk 50.00\nTotal 50.00" });
});
it("parses the native result without exposing raw OCR or the cache path in the draft", async () => {
  const draft = await readReceipt("file:///cache/bill.jpg");
  expect(mock.recognize).toHaveBeenCalledWith("file:///cache/bill.jpg");
  expect(draft).toMatchObject({
    totalPaise: 5000,
    items: [{ name: "Milk", amountPaise: 5000 }],
  });
  expect(draft).not.toHaveProperty("text");
  expect(draft).not.toHaveProperty("uri");
  expect(mock.remove).toHaveBeenCalledOnce();
});
it("does not start reading while backgrounded", async () => {
  mock.state = "background";
  await expect(readReceipt("file:///cache/bill.jpg")).rejects.toThrow(
    "cancelled",
  );
  expect(mock.recognize).not.toHaveBeenCalled();
});
it("cancels delivery on background and refuses overlapping work until native cleanup settles", async () => {
  const pending = deferred<{ text: string }>();
  mock.recognize.mockReturnValueOnce(pending.promise);
  const result = readReceipt("file:///cache/bill.jpg");
  mock.change?.("background");
  await expect(result).rejects.toThrow("cancelled");
  await expect(readReceipt("file:///cache/second.jpg")).rejects.toThrow(
    "previous bill",
  );
  pending.resolve({ text: "LATE RESULT\nTotal 100.00" });
  // The actual pending task settles before a new request is permitted.
  await vi.waitFor(() => expect(mock.remove).toHaveBeenCalledOnce());
  expect((await readReceipt("file:///cache/new.jpg")).totalPaise).toBe(5000);
});
it("discarding a photo prevents its late result from reaching the editor", async () => {
  const pending = deferred<{ text: string }>();
  mock.recognize.mockReturnValueOnce(pending.promise);
  const result = readReceipt("file:///cache/bill.jpg");
  cancelReceipt();
  await expect(result).rejects.toThrow("cancelled");
  pending.resolve({ text: "LATE RESULT\nTotal 100.00" });
  await vi.waitFor(() => expect(mock.remove).toHaveBeenCalledOnce());
});
it("offers manual entry on blank text and hides native exception paths", async () => {
  mock.recognize.mockResolvedValueOnce({ text: "  " });
  await expect(readReceipt("file:///cache/bill.jpg")).rejects.toThrow(
    "No clear bill text",
  );
  mock.recognize.mockRejectedValueOnce(
    new Error("decode file:///private/merchant.jpg"),
  );
  await expect(readReceipt("file:///cache/bill.jpg")).rejects.toThrow(
    "This bill could not be read. Try another photo or type the details.",
  );
});
it("browser preview does not claim to have read a real photo", async () => {
  await expect(previewReceipt("file:///bill.jpg")).rejects.toThrow(
    "Android build",
  );
});
