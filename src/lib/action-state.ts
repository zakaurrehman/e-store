/** Result shape returned by form server actions (client-safe; no server imports). */
export type ActionState<T = undefined> =
  | { status: "idle" }
  | { status: "success"; message?: string; data?: T }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

export const idleState = { status: "idle" } as const;
