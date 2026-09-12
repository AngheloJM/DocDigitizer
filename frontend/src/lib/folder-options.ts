import { backend } from "@/lib/backend";
import type { Folder } from "@/lib/types";

export type FolderOption = {
  id: string;
  label: string;
};

export async function loadFolderTree(ownerId?: string | null): Promise<FolderOption[]> {
  async function visit(parentId: string | null, depth: number): Promise<FolderOption[]> {
    const folders = await backend.folders.list(parentId, ownerId);
    const branches = await Promise.all(
      folders.map(async (folder: Folder) => {
        const current: FolderOption = {
          id: folder.id,
          label: `${"— ".repeat(depth)}${folder.name}`,
        };
        const children = await visit(folder.id, depth + 1);
        return [current, ...children];
      }),
    );

    return branches.flat();
  }

  return visit(null, 0);
}
