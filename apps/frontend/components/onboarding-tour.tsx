"use client";

import * as React from "react";
import { useTranslation } from "next-i18n";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STORAGE_KEY = "onboarding-tour-step";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
}

export const DEFAULT_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to Ignition Pay",
    description: "Let's take a quick tour of the key features to get you started.",
  },
  {
    id: "wallet",
    title: "Connect your wallet",
    description:
      "Link your wallet to send and receive payments securely on the Ignition network.",
  },
  {
    id: "payments",
    title: "Make your first payment",
    description:
      "Create a payment request or send funds directly to anyone in seconds.",
  },
  {
    id: "done",
    title: "You're all set!",
    description:
      "Your account is ready. Explore the dashboard to discover more features.",
  },
];

function clampStep(step: number, max: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.min(Math.max(Math.floor(step), 0), max);
}

function readStoredStep(max: number): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return 0;
    const parsed = Number.parseInt(raw, 10);
    return clampStep(parsed, max);
  } catch {
    return 0;
  }
}

function persistStep(step: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(step));
  } catch {
    // ignore storage failures (e.g. private mode)
  }
}

function clearStoredStep(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

export interface OnboardingTourProps {
  steps?: OnboardingStep[];
  onFinish?: () => void;
  onClose?: () => void;
  className?: string;
}

export function OnboardingTour({
  steps = DEFAULT_STEPS,
  onFinish,
  onClose,
  className,
}: OnboardingTourProps) {
  const { i18n } = useTranslation();
  const lastIndex = Math.max(steps.length - 1, 0);

  const [stepIndex, setStepIndex] = React.useState<number>(0);
  const [hydrated, setHydrated] = React.useState<boolean>(false);

  // Restore persisted step after mount to avoid hydration mismatches.
  React.useEffect(() => {
    setStepIndex(readStoredStep(lastIndex));
    setHydrated(true);
  }, [lastIndex]);

  // Persist the current step whenever it changes (after hydration).
  React.useEffect(() => {
    if (!hydrated) return;
    persistStep(stepIndex);
  }, [stepIndex, hydrated]);

  const current = steps[stepIndex];
  const isLast = stepIndex >= lastIndex;

  const handleNext = React.useCallback(() => {
    if (isLast) {
      clearStoredStep();
      onFinish?.();
      return;
    }
    setStepIndex((prev) => clampStep(prev + 1, lastIndex));
  }, [isLast, lastIndex, onFinish]);

  const handleBack = React.useCallback(() => {
    setStepIndex((prev) => clampStep(prev - 1, lastIndex));
  }, [lastIndex]);

  const handleClose = React.useCallback(() => {
    clearStoredStep();
    onClose?.();
  }, [onClose]);

  if (!steps.length || !current) {
    return null;
  }

  return (
    <div
      className={"fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center".concat(
        className ? `" ${className}` : "",
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-tour-title"
    >
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle id="onboarding-tour-title">{current.title}</CardTitle>
          <CardDescription>{current.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">
              {i18n("onboarding.stepOf", {
                current: stepIndex + 1,
                total: steps.length,
              })}
            </span>
            <div className="flex gap-1">
              {steps.map((step, idx) => (
                <span
                  key={step.id}
                  className={"h-2 w-2 rounded-full ".concat(
                    idx === stepIndex ? "bg-primary" : "bg-muted",
                  )}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between gap-2">
          <Button variant="ghost" onClick={handleClose}>
            {i18n("onboarding.skip")}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={stepIndex === 0}
            >
              {i18n("onboarding.back")}
            </Button>
            <Button onClick={handleNext}>
              {isLast ? i18n("onboarding.finish") : i18n("onboarding.next")}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

export default OnboardingTour;
