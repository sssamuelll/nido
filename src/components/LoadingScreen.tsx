import React from 'react';

interface Props {
  /** Optional override of the default "Cargando..." copy. */
  text?: string;
}

export const LoadingScreen: React.FC<Props> = ({ text = 'Cargando...' }) => (
  <div className="loading-screen">
    <div className="loading-screen__logo"><span>N</span></div>
    <div className="loading-screen__text">{text}</div>
  </div>
);
