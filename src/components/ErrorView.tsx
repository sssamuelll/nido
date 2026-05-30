import React from 'react';
import { Icon, Btn } from './nido';

interface ErrorViewProps {
  message?: string;
  onRetry?: () => void;
  fullScreen?: boolean;
}

export const ErrorView: React.FC<ErrorViewProps> = ({
  message = 'Algo salió mal',
  onRetry,
  fullScreen = false,
}) => {
  return (
    <div
      className="nido grain"
      style={{
        display: 'grid', placeItems: 'center', textAlign: 'center', padding: 32,
        ...(fullScreen ? { minHeight: '100vh' } : { minHeight: 280 }),
      }}
    >
      <div>
        <div
          style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--honey-tint)', color: 'var(--honey)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}
        >
          <Icon.info />
        </div>
        <p style={{ color: 'var(--ink-2)', fontSize: 15, maxWidth: 340, margin: '0 auto 18px' }}>{message}</p>
        {onRetry ? (
          <Btn variant="primary" onClick={onRetry} style={{ margin: '0 auto' }}>
            <Icon.refresh /> Reintentar
          </Btn>
        ) : null}
      </div>
    </div>
  );
};
