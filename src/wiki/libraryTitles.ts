export function libraryTitle(document: { title: string }) {
  return document.title.trim() || 'Untitled';
}

export function byLibraryTitle(a: { title: string }, b: { title: string }) {
  return libraryTitle(a).localeCompare(libraryTitle(b), undefined, { sensitivity: 'base', numeric: true });
}

export function matchesTitle(title: string, query: string) {
  return title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}
