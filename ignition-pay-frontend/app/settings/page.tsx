"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

import { SettingsSectionSkeleton } from "@/components/settings/settings-section-skeleton";

const ProfileSettings = dynamic(
  () => import("@/components/settings/profile-settings"),
  {
    ssr: false,
    loading: () => <SettingsSectionSkeleton />,
  },
);

const SecuritySettings = dynamic(
  () => import("@/components/settings/security-settings"),
  {
    ssr: false,
    loading: () => <SettingsSectionSkeleton />,
  },
);

const ApiKeysSettings = dynamic(
  () => import("@/components/settings/api-keys-settings"),
  {
    ssr: false,
    loading: () => <SettingsSectionSkeleton />,
  },
);

const NotificationSettings = dynamic(
  () => import("@/components/settings/notification-settings"),
  {
    ssr: false,
    loading: () => <SettingsSectionSkeleton />,
  },
);

function SectionFallback() {
  return <SettingsSectionSkeleton />;
}

export default function SettingsPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your account and application preferences.
          </p>
        </header>

        <div className="space-y-6">
          <Suspense fallback={<SectionFallback />}>
            <ProfileSettings />
          </Suspense>

          <Suspense fallback={<SectionFallback />}>
            <SecuritySettings />
          </Suspense>

          <Suspense fallback={<SectionFallback />}>
            <ApiKeysSettings />
          </Suspense>

          <Suspense fallback={<SectionFallback />}>
            <NotificationSettings />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
