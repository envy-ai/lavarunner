import type { EntityProfile, RepositoryHandles, WeaponsFile } from '../domain/types';
import { serializeEntityProfile, serializeWeaponsFile } from '../domain/serialization';
import { EditorFileError, formatUnknownError } from './errors';

const WEAPONS_PATH = 'assets/data/weapons.json';
const ENTITIES_PATH = 'tools/animation-editor/entities';

function assertFileSystemAccessSupport(): void {
  if (
    typeof window === 'undefined' ||
    !('showDirectoryPicker' in window) ||
    !('showOpenFilePicker' in window)
  ) {
    throw new EditorFileError(
      'File System Access API is not available in this browser',
      'browser-file-system-api',
    );
  }
}

async function readJsonFromFileHandle<T>(handle: FileSystemFileHandle, attemptedPath: string): Promise<T> {
  try {
    const file = await handle.getFile();
    const text = await file.text();
    return JSON.parse(text) as T;
  } catch (error) {
    throw new EditorFileError(
      `Failed to read JSON file at ${attemptedPath}. ${formatUnknownError(error)}`,
      attemptedPath,
      error,
    );
  }
}

async function writeTextToFileHandle(
  handle: FileSystemFileHandle,
  content: string,
  attemptedPath: string,
): Promise<void> {
  try {
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  } catch (error) {
    throw new EditorFileError(
      `Failed to write file at ${attemptedPath}. ${formatUnknownError(error)}`,
      attemptedPath,
      error,
    );
  }
}

export function isRepositoryModeSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showDirectoryPicker' in window &&
    'showOpenFilePicker' in window
  );
}

export async function openWeaponsJsonFileWithPicker(): Promise<{ weapons: WeaponsFile; path: string }> {
  assertFileSystemAccessSupport();

  try {
    const picker = window.showOpenFilePicker as (options?: {
      multiple?: boolean;
      types?: Array<{ description?: string; accept: Record<string, string[]> }>;
    }) => Promise<FileSystemFileHandle[]>;

    const [fileHandle] = await picker({
      multiple: false,
      types: [
        {
          description: 'Weapons JSON',
          accept: { 'application/json': ['.json'] },
        },
      ],
    });
    const weapons = await readJsonFromFileHandle<WeaponsFile>(fileHandle, fileHandle.name);
    return {
      weapons,
      path: fileHandle.name,
    };
  } catch (error) {
    throw new EditorFileError(
      `Failed to open weapons JSON. ${formatUnknownError(error)}`,
      WEAPONS_PATH,
      error,
    );
  }
}

export async function openRepositoryFolder(): Promise<{ handles: RepositoryHandles; weapons: WeaponsFile }> {
  assertFileSystemAccessSupport();

  try {
    const directoryPicker = window.showDirectoryPicker as () => Promise<FileSystemDirectoryHandle>;
    const root = await directoryPicker();

    const assetsDir = await root.getDirectoryHandle('assets');
    const dataDir = await assetsDir.getDirectoryHandle('data');
    const weaponsFileHandle = await dataDir.getFileHandle('weapons.json');

    const toolsDir = await root.getDirectoryHandle('tools', { create: true });
    const editorDir = await toolsDir.getDirectoryHandle('animation-editor', { create: true });
    const entitiesDirectoryHandle = await editorDir.getDirectoryHandle('entities', { create: true });

    const weapons = await readJsonFromFileHandle<WeaponsFile>(weaponsFileHandle, WEAPONS_PATH);

    return {
      handles: {
        rootName: root.name,
        weaponsPath: WEAPONS_PATH,
        entitiesPath: ENTITIES_PATH,
        weaponsFileHandle,
        entitiesDirectoryHandle,
      },
      weapons,
    };
  } catch (error) {
    throw new EditorFileError(
      `Failed to open repository folder. ${formatUnknownError(error)}`,
      'repository-root',
      error,
    );
  }
}

export async function writeWeaponsFileToRepository(
  handles: RepositoryHandles,
  weapons: WeaponsFile,
): Promise<void> {
  const content = serializeWeaponsFile(weapons);
  await writeTextToFileHandle(handles.weaponsFileHandle, content, handles.weaponsPath);
}

export async function writeEntityProfileToRepository(
  handles: RepositoryHandles,
  entity: EntityProfile,
): Promise<void> {
  const fileName = `${entity.id}.json`;
  const attemptedPath = `${handles.entitiesPath}/${fileName}`;

  try {
    const fileHandle = await handles.entitiesDirectoryHandle.getFileHandle(fileName, { create: true });
    await writeTextToFileHandle(fileHandle, serializeEntityProfile(entity), attemptedPath);
  } catch (error) {
    throw new EditorFileError(
      `Failed to write entity profile at ${attemptedPath}. ${formatUnknownError(error)}`,
      attemptedPath,
      error,
    );
  }
}
