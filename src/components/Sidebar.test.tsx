import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';

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
    expect(screen.getByText('Nuevo Gasto')).toBeInTheDocument();
    expect(screen.getByText('Analíticas')).toBeInTheDocument();
    expect(screen.getByText('Objetivos')).toBeInTheDocument();
    expect(screen.getByText('Historial')).toBeInTheDocument();
  });

  it('renders settings at the bottom', () => {
    renderWithProviders();
    expect(screen.getByText('Ajustes')).toBeInTheDocument();
  });

  it('highlights active nav item', () => {
    renderWithProviders(['/analytics']);
    const analyticsBtn = screen.getByText('Analíticas').closest('button');
    expect(analyticsBtn).toHaveClass('nav-item--active');
  });
});
