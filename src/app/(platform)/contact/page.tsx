import { Mail } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ContactForm } from "@/components/store/contact-form";
import { Skeleton } from "@/components/ui/misc";
import { getStoreSettings } from "@/features/settings/queries";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Contact Zendropship", description: "Questions about opening a store, the catalogue or fulfilment? Talk to the Zendropship team.", alternates: { canonical: "/contact" } };

async function ContactContent() {
  const [user, settings] = await Promise.all([getCurrentUser(), getStoreSettings()]);
  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <h1 className="text-4xl font-semibold tracking-[-0.03em] md:text-5xl">Talk to us</h1>
        <p className="mt-4 text-[1.0625rem] leading-relaxed text-ink-600">Questions about opening a store, the catalogue, pricing or fulfilment? Send us a message and the team will reply by email.</p>
        {settings.store.supportEmail && (
          <p className="mt-8 flex gap-3 text-[0.9375rem] text-ink-700">
            <Mail className="mt-0.5 size-4 shrink-0 text-ink-950" aria-hidden />
            <a href={`mailto:${settings.store.supportEmail}`} className="underline underline-offset-4">
              {settings.store.supportEmail}
            </a>
          </p>
        )}
      </div>
      <div className="lg:col-span-8">
        <ContactForm defaults={{ name: user ? `${user.firstName} ${user.lastName}` : undefined, email: user?.email }} />
      </div>
    </div>
  );
}

export default function PlatformContactPage() {
  return (
    <div className="container-page pb-24 pt-12">
      <Suspense fallback={<Skeleton className="h-96" />}>
        <ContactContent />
      </Suspense>
    </div>
  );
}
