import React from 'react';

interface Props {
  /** The error message to render. */
  message: string;
  /** Optional retry handler. If omitted, no retry button is rendered. */
  onRetry?: () => void;
}

export const ErrorView: React.FC<Props> = ({ message, onRetry }) => (
  <div className="error-view">
    <div className="error-view__msg">{message}</div>
    {onRetry && (
      <button onClick={onRetry} className="btn btn-primary">
        Reintentar
      </button>
    )}
  </div>
);
