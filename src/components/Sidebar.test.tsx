import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';

// Mock the auth hook
vi.mock('../auth', () => ({
  useAuth: () => ({
    user: { username: 'samuel' },
    isLoading: false,
    isLocked: false,
    login: vi.fn(),
    logout: vi.fn(),
    verifyPin: vi.fn(),
    isAuthenticated: true,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderWithProviders = (initialEntries = ['/']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Sidebar />
    </MemoryRouter>
  );
};

describe('Sidebar component', () => {
  it('renders sidebar with logo', () => {
    renderWithProviders();
    expect(screen.getByText('nido')).toBeInTheDocument();
  });

  it('renders main navigation links', () => {
    renderWithProviders();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Añadir Gasto')).toBeInTheDocument();
    expect(screen.getByText('Analíticas')).toBeInTheDocument();
    expect(screen.getByText('Objetivos')).toBeInTheDocument();
  });

  it('renders secondary navigation links', () => {
    renderWithProviders();
    expect(screen.getByText('Historial')).toBeInTheDocument();
    expect(screen.getByText('Configuración')).toBeInTheDocument();
  });

  it('highlights active nav item', () => {
    renderWithProviders(['/analytics']);
    const analyticsBtn = screen.getByText('Analíticas').closest('button');
    expect(analyticsBtn).toHaveClass('nav-item--active');
  });
});
