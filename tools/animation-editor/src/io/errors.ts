export class EditorFileError extends Error {
  attemptedPath: string;

  constructor(message: string, attemptedPath: string, cause?: unknown) {
    super(message);
    this.name = 'EditorFileError';
    this.attemptedPath = attemptedPath;
    if (cause) {
      this.cause = cause;
    }
  }
}

export function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}
