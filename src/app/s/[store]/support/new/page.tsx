import { Clock, Mail, Package } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { NewConversationForm } from "@/components/store/support/support-forms";
import { Skeleton } from "@/components/ui/misc";
import { getStoreSettings } from "@/features/settings/queries";
import { storeFromParams } from "@/features/stores/route";
import { getCurrentUser } from "@/server/auth/session";

export async function generateMetadata({ params }: PageProps<"/s/[store]/support/new">): Promise<Metadata> {
  const store = await storeFromParams(params);
  return { title: "New message", description: `Write to the ${store.name} customer care team.`, robots: { index: false, follow: false } };
}

async function NewConversation({ params, searchParams }: PageProps<"/s/[store]/support/new">) {
  const [store, query, user, settings] = await Promise.all([storeFromParams(params), searchParams, getCurrentUser(), getStoreSettings()]);
  const supportEmail = store.isPlatformStore ? settings.store.supportEmail : (store.supportEmail ?? settings.store.supportEmail);
  const order = typeof query.order === "string" ? query.order.slice(0, 20) : undefined;

  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <h1 className="text-4xl font-semibold tracking-[-0.03em] md:text-5xl">How can we help?</h1>
        <p className="mt-4 text-[1.0625rem] leading-relaxed text-ink-600">Tell us what you need and we will come back to you — by email, and here in your account.</p>
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
              Tracking a parcel?{" "}
              <Link href="/track-order" className="underline underline-offset-4">
                Look it up
              </Link>{" "}
              or read the{" "}
              <Link href="/faq" className="underline underline-offset-4">
                FAQ
              </Link>
              .
            </span>
          </li>
        </ul>
        {user && (
          <p className="mt-8 text-[0.9375rem] text-ink-600">
            <Link href="/support" className="font-medium text-ink-950 underline underline-offset-4">
              Your earlier messages
            </Link>
          </p>
        )}
      </div>
      <div className="lg:col-span-8">
        <NewConversationForm
          signedIn={!!user}
          defaults={{ name: user ? `${user.firstName} ${user.lastName}` : undefined, email: user?.email, orderNumber: order, subject: order ? `Order ${order.toUpperCase()}` : undefined }}
        />
      </div>
    </div>
  );
}

export default function NewSupportMessagePage(props: PageProps<"/s/[store]/support/new">) {
  return (
    <div className="container-page pb-24 pt-6">
      <Breadcrumbs items={[{ name: "Customer service", href: "/support" }, { name: "New message", href: "/support/new" }]} />
      <div className="mt-8">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <NewConversation {...props} />
        </Suspense>
      </div>
    </div>
  );
}
