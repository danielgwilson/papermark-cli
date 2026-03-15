type FolderDocument = {
  document?: {
    id?: string;
    name?: string;
    type?: string;
  };
};

type FolderNode = {
  id?: string;
  name?: string;
  path?: string;
  documents?: FolderDocument[];
  childFolders?: FolderNode[];
};

type FolderSummary = {
  count: number;
  totalDocuments: number;
  totalChildFolders: number;
  returnedRoots: number;
  roots: Array<{
    id: string | null;
    name: string | null;
    path: string | null;
    documentCount: number;
    childFolderCount: number;
    sampleDocuments: Array<{
      id: string | null;
      name: string | null;
      type: string | null;
    }>;
  }>;
};

export function summarizeFolders(folders: FolderNode[], limit = 25): FolderSummary {
  let totalDocuments = 0;
  let totalChildFolders = 0;

  const roots = folders.slice(0, Math.max(1, limit)).map((folder) => {
    const documentCount = Array.isArray(folder.documents) ? folder.documents.length : 0;
    const childFolderCount = Array.isArray(folder.childFolders) ? folder.childFolders.length : 0;
    return {
      id: folder.id || null,
      name: folder.name || null,
      path: folder.path || null,
      documentCount,
      childFolderCount,
      sampleDocuments: (folder.documents || []).slice(0, 5).map((entry) => ({
        id: entry.document?.id || null,
        name: entry.document?.name || null,
        type: entry.document?.type || null,
      })),
    };
  });

  for (const folder of folders) {
    totalDocuments += Array.isArray(folder.documents) ? folder.documents.length : 0;
    totalChildFolders += Array.isArray(folder.childFolders) ? folder.childFolders.length : 0;
  }

  return {
    count: folders.length,
    totalDocuments,
    totalChildFolders,
    returnedRoots: roots.length,
    roots,
  };
}
