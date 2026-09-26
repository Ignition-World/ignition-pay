"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  disabled?: boolean;
  threshold?: number;
}

export function PullToRefresh({
  onRefresh,
  children,
  disabled = false,
  threshold = 72,
}: PullToRefreshProps) {
  const {
    pullDistance,
    isRefreshing,
    handlers,
  } = usePullToRefresh({
    onRefresh,
    threshold,
    disabled,
  });

  const progress = Math.min(pullDistance / threshold, 1);
  const shouldRefresh = progress >= 1;

  return (
    <div
      {...handlers}
      className="relative min-h-full touch-pan-y overscroll-y-contain"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center overflow-hidden"
        style={{
          height: isRefreshing ? 52 : pullDistance,
          opacity: isRefreshing ? 1 : Math.min(progress * 1.2, 1),
          transition:
            pullDistance === 0 && !isRefreshing
              ? "height 180ms ease, opacity 180ms ease"
              : undefined,
        }}
      >
        <div
          className="mt-3 flex h-9 w-9 items-center justify-center rounded-full bg-background shadow-md ring-1 ring-border"
          style={{
            transform: `rotate(${isRefreshing ? 0 : progress * 180}deg)`,
            transition: isRefreshing
              ? "transform 180ms ease"
              : undefined,
          }}
        >
          <RefreshCw
            className={[
              "h-5 w-5 text-muted-foreground",
              isRefreshing ? "animate-spin" : "",
              shouldRefresh ? "text-primary" : "",
            ].join(" ")}
          />
        </div>
      </div>

      <div
        style={{
          transform:
            pullDistance > 0 && !isRefreshing
              ? `translateY(${Math.min(pullDistance * 0.45, 32)}px)`
              : undefined,
          transition:
            pullDistance === 0 || isRefreshing
              ? "transform 200ms ease"
              : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
