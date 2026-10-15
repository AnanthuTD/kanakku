import { expect, it, vi } from "vitest";
import { parseReceipt } from "../domain/receipt";
import { captureReceipt } from "./receiptCapture";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const draft = parseReceipt("MART\nMilk 50.00\nTotal 50.00");
const fixture = () => ({
  capture: vi.fn(async () => ({ uri: "file:///cache/camera/fixture.jpg" })),
  recognize: vi.fn(async () => draft),
  isCurrent: () => true,
  onReading: vi.fn(),
  dispose: vi.fn(async (_uri: string) => {}),
});
it("deletes the captured photo before returning editable bill fields", async () => {
  const inputs = fixture();
  const output = await captureReceipt(inputs);
  expect(output).toEqual(draft);
  expect(inputs.recognize).toHaveBeenCalledWith(
    "file:///cache/camera/fixture.jpg",
  );
  expect(inputs.dispose).toHaveBeenCalledExactlyOnceWith(
    "file:///cache/camera/fixture.jpg",
  );
});
it("deletes a late captured photo without dispatching OCR after the camera was closed", async () => {
  const pending = deferred<{ uri: string }>();
  let current = true;
  const inputs = fixture();
  inputs.capture.mockReturnValue(pending.promise);
  const result = captureReceipt({ ...inputs, isCurrent: () => current });
  current = false;
  pending.resolve({ uri: "file:///cache/camera/late.jpg" });
  expect(await result).toBeUndefined();
  expect(inputs.recognize).not.toHaveBeenCalled();
  expect(inputs.onReading).not.toHaveBeenCalled();
  expect(inputs.dispose).toHaveBeenCalledExactlyOnceWith(
    "file:///cache/camera/late.jpg",
  );
});
it("discards a late OCR answer after backgrounding and still deletes its photo", async () => {
  const pending = deferred<typeof draft>();
  let current = true;
  const inputs = fixture();
  inputs.recognize.mockReturnValue(pending.promise);
  const result = captureReceipt({ ...inputs, isCurrent: () => current });
  await vi.waitFor(() => expect(inputs.recognize).toHaveBeenCalledOnce());
  current = false;
  pending.resolve(draft);
  expect(await result).toBeUndefined();
  expect(inputs.dispose).toHaveBeenCalledOnce();
});
it("deletes the photo after a recognition failure and does not fabricate a result", async () => {
  const inputs = fixture();
  inputs.recognize.mockRejectedValue(new Error("recognizer failed"));
  await expect(captureReceipt(inputs)).rejects.toThrow("recognizer failed");
  expect(inputs.dispose).toHaveBeenCalledOnce();
});
it("does not emit a draft when its temporary photo cannot be deleted", async () => {
  const inputs = fixture();
  inputs.dispose.mockRejectedValue(new Error("cache cleanup failed"));
  await expect(captureReceipt(inputs)).rejects.toThrow("cache cleanup failed");
});
it("does not call OCR or invent a file when camera capture fails", async () => {
  const inputs = fixture();
  inputs.capture.mockRejectedValue(new Error("camera unavailable"));
  await expect(captureReceipt(inputs)).rejects.toThrow("camera unavailable");
  expect(inputs.recognize).not.toHaveBeenCalled();
  expect(inputs.dispose).not.toHaveBeenCalled();
});
