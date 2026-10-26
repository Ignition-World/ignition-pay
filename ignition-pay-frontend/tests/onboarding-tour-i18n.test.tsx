import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OnboardingTour } from '../components/onboarding-tour'
import { LanguageProvider } from '../lib/i18n'
import { ONBOARDING_STEPS } from '../hooks/use-onboarding-tour'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

function renderTour(locale: string) {
  localStorage.setItem('ignition_pay_locale', locale)
  return render(
    <LanguageProvider>
      <OnboardingTour />
    </LanguageProvider>,
  )
}

describe('OnboardingTour translations (#874)', () => {
  it('shows the first step in Spanish', async () => {
    renderTour('es')
    expect(await screen.findByText('Enviar pagos')).toBeInTheDocument()
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Omitir recorrido' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeInTheDocument()
  })

  it('shows the first step in French', async () => {
    renderTour('fr')
    expect(await screen.findByText('Envoyer des paiements')).toBeInTheDocument()
    expect(screen.getByText('Étape 1 sur 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Passer la visite' })).toBeInTheDocument()
  })

  it('keeps English for the default locale', async () => {
    renderTour('en')
    expect(await screen.findByText('Send payments')).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument()
  })

  it('translates the step shown after pressing Next', async () => {
    renderTour('fr')
    await screen.findByText('Envoyer des paiements')
    await act(async () => {
      screen.getByRole('button', { name: 'Suivant' }).click()
    })
    await waitFor(() => expect(screen.getByText('Recevoir des fonds')).toBeInTheDocument())
  })

  it('has a translation for every step in every supported locale', async () => {
    for (const locale of ['en', 'es', 'fr']) {
      cleanup()
      renderTour(locale)
      for (let index = 0; index < ONBOARDING_STEPS.length; index += 1) {
        const dialog = await screen.findByRole('dialog')
        // Raw keys leak through when a translation is missing.
        expect(dialog.textContent).not.toMatch(/onboardingTour\./)
        if (index < ONBOARDING_STEPS.length - 1) {
          await act(async () => {
            // The dialog's Close button follows the footer, so target the footer.
            const footer = dialog.querySelector('[data-slot="dialog-footer"]')!
            const buttons = footer.querySelectorAll('button')
            buttons[buttons.length - 1].click()
          })
        }
      }
    }
  })
})
