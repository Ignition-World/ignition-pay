import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { expect, test } from 'vitest';
import { ThemeToggle } from '../components/theme-toggle';

expect.extend(toHaveNoViolations);

test('ThemeToggle should have no accessibility violations', async () => {
  const { container } = render(<ThemeToggle />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
