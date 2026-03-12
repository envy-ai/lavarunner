import type { PortableBundle } from '../domain/types';
import { serializeBundle } from '../domain/serialization';
import { EditorFileError, formatUnknownError } from './errors';

export async function importPortableBundleFromPicker(): Promise<PortableBundle> {
  if (typeof window === 'undefined' || !('showOpenFilePicker' in window)) {
    throw new EditorFileError(
      'Import requires the browser File Picker API',
      'portable-bundle-open',
    );
  }

  try {
    const picker = window.showOpenFilePicker as (options?: {
      multiple?: boolean;
      types?: Array<{ description?: string; accept: Record<string, string[]> }>;
    }) => Promise<FileSystemFileHandle[]>;

    const [fileHandle] = await picker({
      multiple: false,
      types: [
        {
          description: 'Animation Editor Bundle',
          accept: { 'application/json': ['.json'] },
        },
      ],
    });

    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text) as PortableBundle;
  } catch (error) {
    throw new EditorFileError(
      `Failed to import bundle. ${formatUnknownError(error)}`,
      'portable-bundle-open',
      error,
    );
  }
}

export function downloadPortableBundle(bundle: PortableBundle): void {
  try {
    const payload = serializeBundle(bundle);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `animation-editor-bundle-${new Date().toISOString()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    throw new EditorFileError(
      `Failed to export bundle. ${formatUnknownError(error)}`,
      'portable-bundle-save',
      error,
    );
  }
}

export function downloadTextFile(fileName: string, content: string): void {
  try {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    throw new EditorFileError(
      `Failed to export file. ${formatUnknownError(error)}`,
      fileName,
      error,
    );
  }
}
