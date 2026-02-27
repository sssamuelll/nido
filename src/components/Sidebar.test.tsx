import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';

describe('Sidebar component', () => {
  const renderWithRouter = (initialEntries = ['/']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <Sidebar />
      </MemoryRouter>
    );
  };

  it('renders sidebar with logo', () => {
    renderWithRouter();
    expect(screen.getByText('🦋 nido')).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    renderWithRouter();
    expect(screen.getByText('Inicio')).toBeInTheDocument();
    expect(screen.getByText('Historial')).toBeInTheDocument();
    expect(screen.getByText('Registrar')).toBeInTheDocument();
    expect(screen.getByText('Configuración')).toBeInTheDocument();
  });

  it('highlights active link based on current route', () => {
    renderWithRouter(['/history']);
    const historyLink = screen.getByText('Historial').closest('a');
    expect(historyLink).toHaveClass('active');
    const homeLink = screen.getByText('Inicio').closest('a');
    expect(homeLink).not.toHaveClass('active');
  });

  it('renders footer with version', () => {
    renderWithRouter();
    expect(screen.getByText('v1.0 · Warm Nest')).toBeInTheDocument();
  });
});