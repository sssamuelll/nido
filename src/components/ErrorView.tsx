import React from 'react';

interface Props {
  /** The error message to render. */
  message: string;
  /** Optional retry handler. If omitted, no retry button is rendered. */
  onRetry?: () => void;
  /**
   * Optional escape action rendered as a subtle text-button below the
   * primary retry. NOT a peer of retry — semantically the retry is the
   * intended action; this is the way out (e.g. "Volver al dashboard").
   */
  secondaryAction?: { label: string; onClick: () => void };
}

export const ErrorView: React.FC<Props> = ({ message, onRetry, secondaryAction }) => (
  <div className="error-view">
    <div className="error-view__msg">{message}</div>
    {onRetry && (
      <button onClick={onRetry} className="btn btn-primary">
        Reintentar
      </button>
    )}
    {secondaryAction && (
      <button onClick={secondaryAction.onClick} className="error-view__secondary">
        {secondaryAction.label}
      </button>
    )}
  </div>
);
