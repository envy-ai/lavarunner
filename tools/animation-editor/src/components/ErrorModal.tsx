interface ErrorModalProps {
  error: { message: string; path: string } | null;
  onClose: () => void;
}

export function ErrorModal(props: ErrorModalProps): JSX.Element | null {
  const { error, onClose } = props;
  if (!error) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="File Error"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Operation Failed</h2>
        <p className="modal-path">Path: {error.path}</p>
        <pre>{error.message}</pre>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
