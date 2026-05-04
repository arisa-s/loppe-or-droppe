export function newId(): string {
  const cryptoMaybe = (
    globalThis as {
      crypto?: { randomUUID?: () => string };
    }
  ).crypto;
  if (typeof cryptoMaybe?.randomUUID === "function") {
    return cryptoMaybe.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return `id_${Date.now().toString(36)}_${random}`;
}
