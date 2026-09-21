import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthSkeleton } from "@/components/store/auth/auth-shell";
import { OpenStoreForm } from "@/components/platform/open-store-form";
import { referralRequired } from "@/features/referrals/service";
import { getOwnedStore } from "@/features/stores/queries";
import { storeBaseDomain } from "@/lib/tenancy";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Create your store",
  description: "Open your Zendropship store in a minute: name it, add products from the catalogue, and start selling. We fulfil every order.",
  alternates: { canonical: "/start" },
};

const INCLUDED = [
  "Your own store address, live immediately",
  "A finished design with search, cart, checkout and customer accounts",
  "Every product in the catalogue, ready to add",
  "Orders sent to Zendropship fulfilment automatically",
  "Order and shipping emails to your customers in your store's name",
];

async function StartContent({ searchParams }: PageProps<"/start">) {
  const [query, user, inviteOnly] = await Promise.all([searchParams, getCurrentUser(), referralRequired()]);
  if (user && (await getOwnedStore(user.id))) redirect("/dashboard");
  const add = typeof query.add === "string" && query.add.length <= 40 ? query.add : undefined;
  return (
    <div className="w-full max-w-[28rem]">
      <h1 className="text-3xl font-semibold tracking-[-0.025em] text-ink-950 md:text-4xl">Create your store</h1>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-600">
        {inviteOnly
          ? "Stores are invitation-only. Enter your code and your store is live in about a minute."
          : add
            ? "Open your store and we'll add the product you picked straight away."
            : "It takes about a minute. You can change everything later."}
      </p>
      <div className="mt-8">
        <OpenStoreForm signedInAs={user ? user.email : null} addProductId={add} baseDomain={storeBaseDomain()} inviteOnly={inviteOnly} />
      </div>
      {!user && (
        <p className="mt-8 border-t border-line pt-6 text-center text-[0.9375rem] text-ink-600">
          Already have a store?{" "}
          <Link href="/login" className="font-medium text-ink-950 underline underline-offset-4">
            Sign in
          </Link>
        </p>
      )}
    </div>
  );
}

export default function StartPage(props: PageProps<"/start">) {
  return (
    <div className="container-page grid gap-12 py-12 md:py-20 lg:grid-cols-12">
      <div className="lg:col-span-6 lg:col-start-1">
        <Suspense fallback={<AuthSkeleton />}>
          <StartContent {...props} />
        </Suspense>
      </div>
      <aside className="lg:col-span-5 lg:col-start-8">
        <div className="rounded-lg bg-canvas p-8">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-950">Included with every store</h2>
          <ul className="mt-5 space-y-3.5">
            {INCLUDED.map((item) => (
              <li key={item} className="flex gap-3 text-[0.9375rem] text-ink-700">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-8 border-t border-line pt-5 text-[0.875rem] text-ink-500">
            Want to look around first?{" "}
            <Link href="/catalog" className="text-ink-950 underline underline-offset-4">
              Browse the catalogue
            </Link>
            .
          </p>
        </div>
      </aside>
    </div>
  );
}
