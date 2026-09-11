/** A dispatched action is not a verified build/compile result. */
export function actionRejected(result: Record<string, unknown>): boolean {
  return ["error", "failed", "unsupported"].includes(String(result.status)) ||
    result.executed === false || result.executed === 0 ||
    /returned false|ExecuteAction=false|module not available|not yet implemented/i.test(String(result.message ?? ""));
}
