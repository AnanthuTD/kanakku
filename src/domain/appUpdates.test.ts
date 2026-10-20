import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AppUpdatesController,
  UpdateTransport,
} from "../services/appUpdatesController";

function setup(patch: Partial<UpdateTransport> = {}) {
  const calls: string[] = [];
  const updater = new AppUpdatesController(
    {
      pending: false,
      check: async () => {
        calls.push("check");
        return { available: true };
      },
      download: async () => {
        calls.push("download");
        return { ready: true };
      },
      reload: async () => {
        calls.push("reload");
      },
      ...patch,
    },
    () => 12345,
  );
  return { updater, calls };
}

describe("app update delivery policy", () => {
  it("does not contact a server until asked and downloads separately from restarting", async () => {
    const { updater, calls } = setup();
    expect(updater.getSnapshot().phase).toBe("idle");
    expect(calls).toEqual([]);
    await updater.check();
    expect(updater.getSnapshot()).toMatchObject({
      phase: "available",
      checkedAt: 12345,
    });
    expect(calls).toEqual(["check"]);
    await updater.download();
    expect(updater.getSnapshot().phase).toBe("ready");
    expect(calls).toEqual(["check", "download"]);
    await updater.restart(() => true);
    expect(calls).toEqual(["check", "download", "reload"]);
  });

  it("automatically downloads an available update but never restarts the app", async () => {
    const { updater, calls } = setup();
    await updater.checkAndDownload();
    expect(updater.getSnapshot().phase).toBe("ready");
    expect(calls).toEqual(["check", "download"]);
    await updater.restart(() => true);
    expect(calls).toEqual(["check", "download", "reload"]);
  });

  it("does not fake updates in an unconfigured or preview build", async () => {
    const { updater, calls } = setup({ unavailableReason: "Not connected" });
    await updater.check();
    await updater.download();
    await updater.restart(() => true);
    updater.observePending(true);
    expect(updater.getSnapshot()).toEqual({
      phase: "unavailable",
      unavailableReason: "Not connected",
    });
    expect(calls).toEqual([]);
  });

  it("keeps the installed app usable after a failed offline check, without leaking server errors", async () => {
    let connected = false;
    const { updater } = setup({
      check: async () => {
        if (!connected) throw new Error("Secret request details");
        return { available: false };
      },
    });
    await updater.check();
    expect(updater.getSnapshot()).toMatchObject({
      phase: "error",
      retry: "check",
    });
    expect(updater.getSnapshot().error).not.toContain("Secret");
    connected = true;
    await updater.check();
    expect(updater.getSnapshot()).toMatchObject({
      phase: "current",
      checkedAt: 12345,
    });
    expect(updater.getSnapshot().error).toBeUndefined();
  });

  it("allows download retry without treating a partial download as ready", async () => {
    let connected = false;
    const { updater, calls } = setup({
      download: async () => {
        if (!connected) throw new Error("offline");
        return { ready: true };
      },
    });
    await updater.check();
    await updater.download();
    expect(updater.getSnapshot()).toMatchObject({
      phase: "error",
      retry: "download",
    });
    await updater.restart(() => true);
    expect(calls).toEqual(["check"]);
    connected = true;
    await updater.download();
    expect(updater.getSnapshot().phase).toBe("ready");
  });

  it("rechecks a fresh safety guard after confirmation and preserves the downloaded update", async () => {
    const { updater, calls } = setup({ pending: true });
    let safe = false;
    await updater.restart(() => safe);
    expect(updater.getSnapshot().phase).toBe("ready");
    expect(updater.getSnapshot().error).toContain("Finish");
    expect(calls).toEqual([]);
    safe = true;
    await updater.restart(() => safe);
    expect(calls).toEqual(["reload"]);
  });

  it("does not redownload or discard an already pending update", async () => {
    const { updater, calls } = setup();
    updater.observePending(true);
    await updater.check();
    await updater.download();
    updater.observePending(false);
    expect(updater.getSnapshot().phase).toBe("ready");
    expect(calls).toEqual([]);
  });

  it("recovers from a failed explicit restart without deleting readiness", async () => {
    let blocked = true;
    const { updater } = setup({
      pending: true,
      reload: async () => {
        if (blocked) throw new Error("native error");
      },
    });
    await updater.restart(() => true);
    expect(updater.getSnapshot()).toMatchObject({
      phase: "error",
      retry: "restart",
    });
    blocked = false;
    await updater.restart(() => true);
    expect(updater.getSnapshot().phase).toBe("restarting");
  });

  it("serializes repeated actions while the native transport is busy", async () => {
    let finish!: (value: { available: boolean }) => void;
    let checks = 0;
    const { updater, calls } = setup({
      check: () => {
        checks += 1;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    });
    const first = updater.check();
    await updater.check();
    await updater.download();
    await updater.restart(() => true);
    updater.observePending(true);
    expect(updater.getSnapshot().phase).toBe("checking");
    expect(checks).toBe(1);
    expect(calls).toEqual([]);
    finish({ available: true });
    await first;
    expect(updater.getSnapshot().phase).toBe("available");
  });

  it("does not call a successful empty fetch a downloaded update", async () => {
    const { updater } = setup({ download: async () => ({ ready: false }) });
    await updater.check();
    await updater.download();
    expect(updater.getSnapshot().phase).toBe("current");
  });

  it("notifies mounted observers and releases them on unmount", async () => {
    const { updater } = setup();
    const phases: string[] = [];
    const unsubscribe = updater.subscribe(() =>
      phases.push(updater.getSnapshot().phase),
    );
    await updater.check();
    unsubscribe();
    await updater.download();
    expect(phases).toEqual(["checking", "available"]);
  });
});

const require = createRequire(import.meta.url);
const buildConfig = require("../../app.config.js") as (args: {
  config: Record<string, unknown>;
}) => any;
const profileFile = fileURLToPath(
  new URL("../../kanakku-profile.json", import.meta.url),
);
/** app.config persists the profile; tests must leave the real file as they found it. */
function withProfileFile<T>(run: () => T): T {
  const saved = existsSync(profileFile)
    ? readFileSync(profileFile, "utf8")
    : null;
  try {
    return run();
  } finally {
    if (saved === null) rmSync(profileFile, { force: true });
    else writeFileSync(profileFile, saved);
  }
}
function configWith(projectId?: string, profile?: string) {
  return withProfileFile(() => configWithEnv(projectId, profile));
}
function configWithEnv(projectId?: string, profile?: string) {
  const originalProject = process.env.KANAKKU_EAS_PROJECT_ID;
  const originalProfile = process.env.KANAKKU_BUILD_PROFILE;
  try {
    // Explicit empty override exercises the supported offline build mode even
    // after the owner's verified public project configuration is persisted.
    process.env.KANAKKU_EAS_PROJECT_ID = projectId ?? "";
    if (profile === undefined) delete process.env.KANAKKU_BUILD_PROFILE;
    else process.env.KANAKKU_BUILD_PROFILE = profile;
    return buildConfig({
      config: {
        name: "Kanakku",
        android: { package: "app.tinkerbox.kanakku", allowBackup: false },
        extra: { other: true },
      },
    });
  } finally {
    if (originalProject === undefined)
      delete process.env.KANAKKU_EAS_PROJECT_ID;
    else process.env.KANAKKU_EAS_PROJECT_ID = originalProject;
    if (originalProfile === undefined) delete process.env.KANAKKU_BUILD_PROFILE;
    else process.env.KANAKKU_BUILD_PROFILE = originalProfile;
  }
}
describe("OTA native build configuration", () => {
  it("keeps cloud build profiles on the existing local signing credentials and matching channels", () => {
    const { build } = require("../../eas.json");
    expect(build["personal-beta"]).toMatchObject({
      credentialsSource: "local",
      channel: "personal-beta",
      environment: "preview",
      env: { KANAKKU_BUILD_PROFILE: "personal" },
    });
    expect(build.e2e).toMatchObject({
      credentialsSource: "local",
      channel: "e2e",
      environment: "preview",
      env: { KANAKKU_BUILD_PROFILE: "e2e" },
    });
  });
  it("links the verified owner project when no override is supplied", () => {
    const previous = process.env.KANAKKU_EAS_PROJECT_ID;
    try {
      delete process.env.KANAKKU_EAS_PROJECT_ID;
      const config = buildConfig({ config: {} });
      expect(config.owner).toBe("ananthutds-team");
      expect(config.slug).toBe("kanakku");
      expect(config.extra.eas.projectId).toBe(
        "b609ea53-b8e5-42ff-9550-2e46880bcda4",
      );
      expect(config.updates.enabled).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.KANAKKU_EAS_PROJECT_ID;
      else process.env.KANAKKU_EAS_PROJECT_ID = previous;
    }
  });
  it("keeps network delivery disabled when no owner project exists", () => {
    const config = configWith();
    expect(config.updates).toEqual({
      enabled: false,
      checkAutomatically: "NEVER",
      fallbackToCacheTimeout: 0,
    });
    expect(config.extra.eas).toBeUndefined();
    expect(config.runtimeVersion).toEqual({ policy: "fingerprint" });
    expect(config.extra.other).toBe(true);
  });
  it("persists the chosen profile so a step run without the env var (Gradle fingerprint, eas update) resolves the same config", () => {
    withProfileFile(() => {
      configWithEnv("b609ea53-b8e5-42ff-9550-2e46880bcda4", "e2e");
      expect(JSON.parse(readFileSync(profileFile, "utf8"))).toEqual({
        profile: "e2e",
      });
      const later = configWithEnv("b609ea53-b8e5-42ff-9550-2e46880bcda4");
      expect(later.android.package).toBe("app.tinkerbox.kanakku.e2e");
      expect(later.updates.requestHeaders["expo-channel-name"]).toBe("e2e");
      configWithEnv("b609ea53-b8e5-42ff-9550-2e46880bcda4", "personal");
      expect(
        configWithEnv("b609ea53-b8e5-42ff-9550-2e46880bcda4").android.package,
      ).toBe("app.tinkerbox.kanakku");
      expect(() =>
        configWithEnv("b609ea53-b8e5-42ff-9550-2e46880bcda4", "bogus"),
      ).toThrow("must be 'e2e' or 'personal'");
    });
  });
  it("isolates personal and test update channels alongside their Android UIDs", () => {
    const project = "12345678-1234-4123-8123-123456789012"; // Config-only synthetic UUID; never contacted.
    // Explicit: with the profile persisted, "no env var" means "last used", never "personal".
    const personal = configWith(project, "personal");
    const e2e = configWith(project, "e2e");
    expect(personal.android.package).toBe("app.tinkerbox.kanakku");
    expect(e2e.android.package).toBe("app.tinkerbox.kanakku.e2e");
    expect(e2e.android.allowBackup).toBe(false);
    expect(personal.updates.requestHeaders).toEqual({
      "expo-channel-name": "personal-beta",
    });
    expect(e2e.updates.requestHeaders).toEqual({ "expo-channel-name": "e2e" });
    expect(personal.updates.url).toBe(`https://u.expo.dev/${project}`);
    expect(personal.extra.eas.projectId).toBe(project);
  });
  it("fails a malformed project ID instead of building with an arbitrary URL", () => {
    expect(() => configWith("https://untrusted.test")).toThrow("UUID");
  });
});
