/** The updater's policy, independent of React Native and Expo transport. */
export type UpdatePhase =
  | "unavailable"
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "ready"
  | "restarting"
  | "error";
export type UpdateState = Readonly<{
  phase: UpdatePhase;
  unavailableReason?: string;
  error?: string;
  retry?: "check" | "download" | "restart";
  checkedAt?: number;
}>;
export interface UpdateTransport {
  unavailableReason?: string;
  pending: boolean;
  check(): Promise<{ available: boolean }>;
  download(): Promise<{ ready: boolean }>;
  reload(): Promise<void>;
}

/** No reload is triggered by checking, fetching, backgrounding or a timer. */
export class AppUpdatesController {
  private state: UpdateState;
  private listeners = new Set<() => void>();
  constructor(
    private readonly transport: UpdateTransport,
    private readonly now = Date.now,
  ) {
    this.state = transport.unavailableReason
      ? { phase: "unavailable", unavailableReason: transport.unavailableReason }
      : { phase: transport.pending ? "ready" : "idle" };
  }
  getSnapshot = (): UpdateState => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(patch: Partial<UpdateState>) {
    this.state = {
      ...this.state,
      error: undefined,
      retry: undefined,
      ...patch,
    };
    this.listeners.forEach((listener) => listener());
  }
  private get working() {
    return ["checking", "downloading", "restarting"].includes(this.state.phase);
  }

  /** Reconcile an already-downloaded update exposed by Expo's native hook. */
  observePending(pending: boolean) {
    if (pending && !this.working && this.state.phase !== "unavailable")
      this.set({ phase: "ready" });
  }
  async check() {
    if (this.working || ["unavailable", "ready"].includes(this.state.phase))
      return;
    this.set({ phase: "checking" });
    try {
      const result = await this.transport.check();
      this.set({
        phase: result.available ? "available" : "current",
        checkedAt: this.now(),
      });
    } catch {
      this.set({
        phase: "error",
        retry: "check",
        error:
          "Could not check for updates. Check your connection and try again. Your installed app still works offline.",
      });
    }
  }
  async download() {
    if (
      this.working ||
      !(this.state.phase === "available" || this.state.retry === "download")
    )
      return;
    this.set({ phase: "downloading" });
    try {
      const result = await this.transport.download();
      this.set({ phase: result.ready ? "ready" : "current" });
    } catch {
      this.set({
        phase: "error",
        retry: "download",
        error:
          "The update could not be downloaded. Your current version is unchanged. Try again when connected.",
      });
    }
  }
  /** Call only after explicit confirmation. Guard is evaluated at dispatch time. */
  async restart(canRestart: () => boolean) {
    if (
      this.working ||
      !(this.state.phase === "ready" || this.state.retry === "restart")
    )
      return;
    if (!canRestart()) {
      this.set({
        phase: "ready",
        error:
          "Finish your current action and save your changes before restarting.",
      });
      return;
    }
    this.set({ phase: "restarting" });
    try {
      await this.transport.reload();
    } catch {
      this.set({
        phase: "error",
        retry: "restart",
        error:
          "Kanakku could not restart. The downloaded update can be applied on the next full app start.",
      });
    }
  }
}
