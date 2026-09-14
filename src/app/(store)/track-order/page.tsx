import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { lookupOrder } from "@/features/orders/queries";
import { getRequestMeta } from "@/server/request";
import { rateLimit } from "@/server/security/rate-limit";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Track your order", description: "Check the status of your Veyora order with your order number and email address.", alternates: { canonical: "/track-order" } };

async function lookup(formData: FormData) {
  "use server";
  const number = String(formData.get("number") ?? "");
  const email = String(formData.get("email") ?? "");
  const meta = await getRequestMeta();
  const limit = await rateLimit("orderLookup", meta.ipAddress);
  if (!limit.success) redirect("/track-order?error=rate");
  const found = await lookupOrder(number, email);
  if (!found) redirect("/track-order?error=notfound");
  redirect(`/orders/${found.number}?token=${found.token}`);
}

async function TrackContent({ searchParams }: PageProps<"/track-order">) {
  const { error } = await searchParams;
  return (
    <>
      {error === "notfound" && <Alert tone="warning">We couldn&rsquo;t find an order with that number and email. Check your confirmation email and try again.</Alert>}
      {error === "rate" && <Alert tone="warning">Too many attempts. Please wait a few minutes and try again.</Alert>}
      <form action={lookup} className="mt-6 space-y-5">
        <TextField name="number" label="Order number" placeholder="VY-XXXX-XXXX" required autoComplete="off" className="uppercase" />
        <TextField name="email" type="email" label="Email address used at checkout" required autoComplete="email" />
        <SubmitButton fullWidth size="lg">
          Track order
        </SubmitButton>
      </form>
    </>
  );
}

export default function TrackOrderPage(props: PageProps<"/track-order">) {
  return (
    <div className="container-page flex justify-center py-12 md:py-20">
      <div className="w-full max-w-[26rem]">
        <h1 className="text-3xl font-semibold tracking-[-0.025em]">Track your order</h1>
        <p className="mt-2 text-[0.9375rem] text-ink-600">Enter your order number and the email address you used at checkout.</p>
        <Suspense fallback={null}>
          <TrackContent {...props} />
        </Suspense>
      </div>
    </div>
  );
}
