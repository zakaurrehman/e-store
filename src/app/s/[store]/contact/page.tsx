import { Clock, Mail, Package } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { ContactForm } from "@/components/store/contact-form";
import { Skeleton } from "@/components/ui/misc";
import { getStoreSettings } from "@/features/settings/queries";
import { storeFromParams } from "@/features/stores/route";
import { getCurrentUser } from "@/server/auth/session";

export async function generateMetadata({ params }: PageProps<"/s/[store]/contact">): Promise<Metadata> {
  const store = await storeFromParams(params);
  return { title: "Contact us", description: `Get in touch with the ${store.name} customer care team.`, alternates: { canonical: "/contact" } };
}

async function ContactContent({ params, searchParams }: PageProps<"/s/[store]/contact">) {
  const [query, user, settings, store] = await Promise.all([searchParams, getCurrentUser(), getStoreSettings(), storeFromParams(params)]);
  const supportEmail = store.isPlatformStore ? settings.store.supportEmail : (store.supportEmail ?? settings.store.supportEmail);
  return (
    <div className="mt-8 grid gap-12 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <h1 className="text-4xl font-semibold tracking-[-0.03em] md:text-5xl">Contact us</h1>
        <p className="mt-4 text-[1.0625rem] leading-relaxed text-ink-600">Questions about an order, a product or your account? We’re real people and we read every message.</p>
        <ul className="mt-8 space-y-4 text-[0.9375rem] text-ink-700">
          <li className="flex gap-3">
            <Clock className="mt-0.5 size-4 shrink-0 text-ink-950" aria-hidden />
            <span>
              Replies within one business day.
              <br />
              {settings.store.supportHours}
            </span>
          </li>
          {supportEmail && (
            <li className="flex gap-3">
              <Mail className="mt-0.5 size-4 shrink-0 text-ink-950" aria-hidden />
              <a href={`mailto:${supportEmail}`} className="underline underline-offset-4">
                {supportEmail}
              </a>
            </li>
          )}
          <li className="flex gap-3">
            <Package className="mt-0.5 size-4 shrink-0 text-ink-950" aria-hidden />
            <span>
              Looking for an order?{" "}
              <Link href="/track-order" className="underline underline-offset-4">
                Track it here
              </Link>{" "}
              or check the{" "}
              <Link href="/faq" className="underline underline-offset-4">
                FAQ
              </Link>
              .
            </span>
          </li>
        </ul>
      </div>
      <div className="lg:col-span-8">
        <ContactForm defaults={{ name: user ? `${user.firstName} ${user.lastName}` : undefined, email: user?.email, orderNumber: typeof query.order === "string" ? query.order : undefined }} />
      </div>
    </div>
  );
}

export default function ContactPage(props: PageProps<"/s/[store]/contact">) {
  return (
    <div className="container-page pb-24 pt-6">
      <Breadcrumbs items={[{ name: "Contact", href: "/contact" }]} />
      <Suspense fallback={<Skeleton className="mt-8 h-96" />}>
        <ContactContent {...props} />
      </Suspense>
    </div>
  );
}
