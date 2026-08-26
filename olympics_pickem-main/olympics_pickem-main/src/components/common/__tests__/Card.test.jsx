import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardBody, CardFooter } from '../Card.jsx';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<Card className="custom-class">Content</Card>);
    expect(container.firstChild.className).toContain('custom-class');
  });

  it('passes additional props', () => {
    render(<Card data-testid="my-card">Content</Card>);
    expect(screen.getByTestId('my-card')).toBeInTheDocument();
  });
});

describe('CardHeader', () => {
  it('renders children', () => {
    render(<CardHeader>Header text</CardHeader>);
    expect(screen.getByText('Header text')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<CardHeader className="header-class">Header</CardHeader>);
    expect(screen.getByText('Header')).toHaveClass('header-class');
  });
});

describe('CardBody', () => {
  it('renders children', () => {
    render(<CardBody>Body text</CardBody>);
    expect(screen.getByText('Body text')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<CardBody className="body-class">Body</CardBody>);
    expect(screen.getByText('Body')).toHaveClass('body-class');
  });
});

describe('CardFooter', () => {
  it('renders children', () => {
    render(<CardFooter>Footer text</CardFooter>);
    expect(screen.getByText('Footer text')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<CardFooter className="footer-class">Footer</CardFooter>);
    expect(screen.getByText('Footer')).toHaveClass('footer-class');
  });
});

describe('Card composition', () => {
  it('renders complete card with header, body, and footer', () => {
    render(
      <Card>
        <CardHeader>Title</CardHeader>
        <CardBody>Main content</CardBody>
        <CardFooter>Actions</CardFooter>
      </Card>
    );

    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Main content')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });
});
