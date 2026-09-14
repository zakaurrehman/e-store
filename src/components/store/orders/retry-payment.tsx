"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { retryPaymentAction } from "@/features/checkout/actions";

export function RetryPaymentButton({ orderNumber, token }: { orderNumber: string; token?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await retryPaymentAction({ orderNumber, token });
          if (!result.ok) {
            setError(result.error);
            setBusy(false);
            return;
          }
          window.location.assign(result.redirectUrl);
        }}
      >
        Complete payment
      </Button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
