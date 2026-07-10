export function splitMemoryChunks(content: string, maxChunkChars = 1200): string[] {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > maxChunkChars) {
    const splitAt = findSplitPoint(remaining, maxChunkChars);
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) {
    chunks.push(remaining);
  }

  return chunks.slice(0, 25);
}

function findSplitPoint(value: string, maxChunkChars: number): number {
  const window = value.slice(0, maxChunkChars);
  const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
  if (sentence > maxChunkChars * 0.5) {
    return sentence + 1;
  }
  const space = window.lastIndexOf(" ");
  return space > maxChunkChars * 0.5 ? space : maxChunkChars;
}
