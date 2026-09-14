"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markNotificationsReadAction } from "@/features/account/actions";

export function MarkAllReadButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="secondary" size="sm" loading={pending} onClick={() => startTransition(async () => void (await markNotificationsReadAction()))}>
      Mark all as read
    </Button>
  );
}
