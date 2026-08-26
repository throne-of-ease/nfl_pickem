import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../Button.jsx';

describe('Button', () => {
  it('renders children text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click me</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is disabled when loading prop is true', () => {
    render(<Button loading>Click me</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('does not call onClick when disabled', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick} disabled>Click me</Button>);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('does not call onClick when loading', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick} loading>Click me</Button>);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('has correct type attribute', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('defaults to type button', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('passes additional props to button element', () => {
    render(<Button data-testid="my-button" aria-label="Custom label">Click me</Button>);

    const button = screen.getByTestId('my-button');
    expect(button).toHaveAttribute('aria-label', 'Custom label');
  });

  it('applies custom className', () => {
    render(<Button className="custom-class">Click me</Button>);
    expect(screen.getByRole('button')).toHaveClass('custom-class');
  });
});
