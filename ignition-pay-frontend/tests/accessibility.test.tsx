import { readFileSync } from 'node:fs';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { afterEach, expect, test } from 'vitest';
import { ThemeToggle } from '../components/theme-toggle';
import { OnboardingTour } from '../components/onboarding-tour';

expect.extend(toHaveNoViolations);

test('accessibility audit tooling stays out of production dependencies', () => {
  const frontendPackage = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );

  expect(frontendPackage.devDependencies['jest-axe']).toBeDefined();
  expect(frontendPackage.dependencies).not.toHaveProperty('jest-axe');
  expect(frontendPackage.dependencies).not.toHaveProperty('react-axe');
});

afterEach(() => {
  localStorage.clear();
  cleanup();
});

test('ThemeToggle should have no accessibility violations', async () => {
  const { container } = render(<ThemeToggle />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});

test('OnboardingTour should have no accessibility violations', async () => {
  render(<OnboardingTour />);
  await waitFor(() => screen.getByRole('dialog'));

  // The tour renders in a portal, so the dialog lives outside the container
  // returned by `render`. Scanning the document body covers the whole tree.
  // `region` is switched off because the portal is a sibling of the app's
  // landmarks by construction; every other rule still applies.
  const results = await axe(document.body, {
    rules: { region: { enabled: false } },
  });
  expect(results).toHaveNoViolations();
});
