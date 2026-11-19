import { z } from 'zod';
import type { Page, WikiFolder } from './types';

const folderId = z.string().min(1);
export const wikiFoldersSchema = z.array(z.object({
  id: folderId,
  name: z.string().trim().min(1),
  parentId: folderId.nullable(),
  pageIds: z.array(folderId),
}));

export function folderTrail(folders: ReadonlyMap<string, WikiFolder>, id: string | null): WikiFolder[] {
  const trail: WikiFolder[] = [];
  const seen = new Set<string>();
  while (id !== null) {
    if (seen.has(id)) throw new Error('Wiki folder cycle');
    const folder = folders.get(id);
    if (!folder) throw new Error('Missing wiki folder');
    seen.add(id);
    trail.push(folder);
    id = folder.parentId;
  }
  return trail.reverse();
}

export function validateWikiFolders(value: unknown, pages: Page[]): WikiFolder[] {
  const folders = wikiFoldersSchema.parse(value);
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  if (byId.size !== folders.length) throw new Error('Duplicate wiki folder IDs');
  const available = new Set(pages.map(page => page.id));
  const placed = new Set<string>();
  for (const folder of folders) {
    folderTrail(byId, folder.id);
    for (const id of folder.pageIds) {
      if (!available.has(id)) throw new Error('Missing page in wiki folder');
      if (placed.has(id)) throw new Error('Page appears in multiple wiki folder entries');
      placed.add(id);
    }
  }
  return folders;
}

export function placeWikiPage(folders: WikiFolder[], pageId: string, folderId: string | null): WikiFolder[] {
  const current = folders.find(folder => folder.pageIds.includes(pageId))?.id ?? null;
  if (current === folderId || (folderId !== null && !folders.some(folder => folder.id === folderId))) return folders;
  return folders.map(folder => {
    if (folder.id === folderId) return { ...folder, pageIds: [...folder.pageIds, pageId] };
    if (folder.id === current) return { ...folder, pageIds: folder.pageIds.filter(id => id !== pageId) };
    return folder;
  });
}
