export function newNodeId(usedIds: Iterable<string>): string {
  const used = new Set(usedIds);
  let id: string;
  do {
    id = `node${Math.floor(Math.random() * 36 ** 5).toString(36).padStart(5, '0')}`;
  } while (used.has(id));
  return id;
}
