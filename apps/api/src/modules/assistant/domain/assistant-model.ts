/**
 * Per-cooperative choice of the assistant's local model (US-AI-07, ADR-014).
 * Pure rules: which models can be offered and which one a request actually uses.
 */

/**
 * BR-AI-09: only models the operator allowlisted AND that are installed in Ollama are offered.
 * `installed` is null when Ollama cannot be asked (down): the allowlist alone is then trusted,
 * the chat call itself reports the failure.
 */
export function offeredModels(
  allowed: readonly string[],
  installed: readonly string[] | null,
): string[] {
  if (installed === null) return [...allowed];
  const present = new Set(installed);
  return allowed.filter((model) => present.has(model));
}

/**
 * BR-AI-09: the saved model is used only while it is still offered; otherwise the server
 * default answers, so a removed or de-listed model never breaks the assistant.
 */
export function effectiveModel(
  saved: string | null,
  defaultModel: string,
  offered: readonly string[],
): string {
  return saved !== null && offered.includes(saved) ? saved : defaultModel;
}

/** The choice must be one of the offered models; null (back to the default) is always valid. */
export function isSelectable(model: string | null, offered: readonly string[]): boolean {
  return model === null || offered.includes(model);
}
