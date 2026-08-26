import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Loading, LoadingOverlay } from '../Loading.jsx';

describe('Loading', () => {
  it('renders with default text', () => {
    render(<Loading />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders with custom text', () => {
    render(<Loading text="Please wait..." />);
    expect(screen.getByText('Please wait...')).toBeInTheDocument();
  });

  it('does not render text when text is empty', () => {
    render(<Loading text="" />);
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('does not render text when text is null', () => {
    render(<Loading text={null} />);
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('renders spinner element', () => {
    const { container } = render(<Loading />);
    expect(container.querySelector('[class*="spinner"]')).toBeInTheDocument();
  });
});

describe('LoadingOverlay', () => {
  it('renders with text', () => {
    render(<LoadingOverlay text="Loading data..." />);
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('renders overlay container', () => {
    const { container } = render(<LoadingOverlay text="Loading..." />);
    expect(container.querySelector('[class*="overlay"]')).toBeInTheDocument();
  });

  it('renders Loading component inside', () => {
    const { container } = render(<LoadingOverlay text="Wait..." />);
    expect(container.querySelector('[class*="spinner"]')).toBeInTheDocument();
  });
});
