import { ArrowRight, BellRing, Boxes, PackageCheck, RefreshCw, Store, Tags } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { CatalogGrid, marginAt } from "@/components/platform/catalog-card";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { countCatalogProducts, getProductRail } from "@/features/catalog/queries";
import { commissionRuleOf } from "@/features/finance/order-finance";
import { getStoreSettings } from "@/features/settings/queries";
import { getOwnedStore, getShelfProductIds } from "@/features/stores/queries";
import { DEMO_STORE_SLUG, storeBaseDomain, storeUrl } from "@/lib/tenancy";
import { getCurrentUser } from "@/server/auth/session";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = {
  title: { absolute: "Zendropship — Build your online store. Choose products. We handle the rest." },
  description: "Open a ready-made online store, add products from the Zendropship catalogue, and sell. Every order goes straight to our fulfilment team — no stock, packing or shipping for you.",
  alternates: { canonical: "/" },
};

const STEPS = [
  { title: "Browse the catalogue", text: "See every product with what you pay, what it sells for and what you keep — before you sign up." },
  { title: "Create your store", text: "Pick a name. Your store goes live at its own address with a finished design, pages and checkout." },
  { title: "Add products", text: "Tap “Add to my store” on the products you want. Only those appear in your store." },
  { title: "Start selling", text: "Share your store. Customers browse, pay and track their orders there, under your name." },
  { title: "We fulfil every order", text: "Each order goes to Zendropship fulfilment the moment it is placed. We pack and ship it." },
];

const AUTOMATION = [
  { icon: PackageCheck, title: "Orders go straight to fulfilment", text: "When a customer checks out, the order is already with our fulfilment team. You never forward, pack or ship anything." },
  { icon: RefreshCw, title: "Stock and prices stay in sync", text: "Your store reads live stock from our catalogue, so it never sells something we can't ship. Supplier price changes flow through automatically." },
  { icon: BellRing, title: "Customers are kept informed", text: "Order confirmations, shipping and delivery updates are emailed to your customers in your store's name." },
  { icon: Store, title: "A finished store from day one", text: "Design, navigation, search, product pages, cart, checkout and customer accounts are ready the moment you open." },
];

const FAQ = [
  { q: "Do I need to buy stock?", a: "No. Products stay in our fulfilment centre. When one of your customers orders, we ship it from there." },
  { q: "Who packs and ships the orders?", a: "Zendropship does. Orders placed in your store reach our fulfilment team automatically, and your customer gets tracking updates by email." },
  { q: "How much do I earn?", a: "The difference between your selling price and the wholesale price shown on every product. Sell at the suggested price or set your own markup — the dashboard shows your margin on each product." },
  { q: "Can I choose which products I sell?", a: "Yes. Your store only shows the products you add, and you can hide or remove any of them at any time." },
  { q: "What address does my store get?", a: `Every store gets its own address, like yourname.${storeBaseDomain()}. Connecting your own domain is on the way.` },
  { q: "How do my customers pay?", a: "Checkout uses the payment methods enabled on the platform. Card payments through your own Stripe account are the next feature on our list; the dashboard shows when it is available." },
];

async function PreviewProducts() {
  const [featured, settings] = await Promise.all([getProductRail("featured", 4), getStoreSettings()]);
  const products = featured.slice(0, 4);
  const fallback = products.length < 4 ? await getProductRail("new", 4) : [];
  const items = [...products, ...fallback].slice(0, 4);
  const commission = commissionRuleOf(settings.platform);
  return (
    <ul className="grid grid-cols-2 gap-3 p-4">
      {items.map((product) => {
        const margin = marginAt(product.priceCents, product.costCents, commission);
        return (
          <li key={product.id} className="overflow-hidden rounded-md border border-line bg-surface">
            <div className="relative aspect-square bg-canvas">
              {product.images[0] && <Image src={product.images[0].url} alt={product.images[0].alt} fill sizes="(min-width: 1024px) 14vw, 40vw" className="object-cover" />}
            </div>
            <div className="p-2.5">
              <p className="line-clamp-1 text-[0.8125rem] font-medium text-ink-950">{product.name}</p>
              <p className="tabular mt-0.5 flex items-baseline justify-between text-[0.75rem]">
                <span className="text-ink-950">{formatMoney(product.priceCents)}</span>
                <span className="text-success">+{formatMoney(margin.cents)}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

async function CatalogPreview() {
  const [products, total, user, settings] = await Promise.all([getProductRail("best-sellers", 8), countCatalogProducts(), getCurrentUser(), getStoreSettings()]);
  const items = products.length >= 4 ? products : await getProductRail("new", 8);
  const store = user ? await getOwnedStore(user.id) : null;
  const inStoreIds = store ? await getShelfProductIds(store.id) : [];
  return (
    <>
      <CatalogGrid products={items} inStoreIds={inStoreIds} signedIn={!!user} commission={commissionRuleOf(settings.platform)} />
      <div className="mt-10 flex justify-center">
        <ButtonLink href="/catalog" variant="secondary" size="lg" className="gap-2">
          Browse all {total.toLocaleString("en-US")} products <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </div>
    </>
  );
}

export default function LandingPage() {
  const demoUrl = storeUrl(DEMO_STORE_SLUG);
  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_85%_-10%,var(--color-iris-50),transparent)]" />
        <div className="container-page relative grid items-center gap-12 py-16 md:py-24 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-6">
            <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-iris-600">Dropshipping, done for you</p>
            <h1 className="mt-5 text-balance text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.035em] text-ink-950 sm:text-6xl lg:text-[4.25rem]">
              Build your online store. Choose products. <em className="font-display font-normal italic tracking-normal text-iris-600">We handle the rest.</em>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600">
              Open a ready-made store at your own address, pick products from our catalogue, and start selling. Every order goes straight to our fulfilment team — no stock to buy, nothing to pack, nothing to ship.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/start" size="lg" className="gap-2">
                Create your store <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/catalog" variant="secondary" size="lg">
                Browse the catalogue
              </ButtonLink>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[0.875rem] text-ink-600">
              <li className="flex items-center gap-2"><Boxes className="size-4 text-ink-950" aria-hidden /> No stock to buy</li>
              <li className="flex items-center gap-2"><PackageCheck className="size-4 text-ink-950" aria-hidden /> We pack and ship</li>
              <li className="flex items-center gap-2"><Tags className="size-4 text-ink-950" aria-hidden /> You set your prices</li>
            </ul>
          </div>
          <div className="lg:col-span-6">
            <figure className="relative mx-auto max-w-lg rounded-lg border border-line bg-canvas shadow-[0_30px_80px_-40px_rgb(11_12_14/0.45)]">
              <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                <span className="flex gap-1.5" aria-hidden>
                  <span className="size-2.5 rounded-full bg-line-strong" />
                  <span className="size-2.5 rounded-full bg-line-strong" />
                  <span className="size-2.5 rounded-full bg-line-strong" />
                </span>
                <span className="tabular ml-2 flex-1 truncate rounded-sm bg-surface px-3 py-1 text-[0.75rem] text-ink-600">yourstore.{storeBaseDomain()}</span>
              </div>
              <Suspense fallback={<div className="grid grid-cols-2 gap-3 p-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="aspect-[4/5] rounded-md" />)}</div>}>
                <PreviewProducts />
              </Suspense>
              <figcaption className="absolute -bottom-5 left-6 flex items-center gap-2.5 rounded-full border border-line bg-surface px-4 py-2 text-[0.8125rem] shadow-sm">
                <span className="size-2 rounded-full bg-success" aria-hidden />
                New order → sent to fulfilment automatically
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-20 py-16 md:py-24">
        <div className="container-page">
          <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-ink-500">How it works</p>
          <h2 className="mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-[-0.03em] text-ink-950 md:text-5xl">From idea to first sale in five steps</h2>
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex flex-col rounded-md border border-line p-5">
                <span className="tabular flex size-8 items-center justify-center rounded-full bg-ink-950 text-sm font-semibold text-white">{index + 1}</span>
                <h3 className="mt-5 text-[1.0625rem] font-semibold tracking-[-0.01em] text-ink-950">{step.title}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-600">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-ink-950 py-16 text-white md:py-24">
        <div className="container-page">
          <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-white/50">Handled for you</p>
          <h2 className="mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-[-0.03em] md:text-5xl">You run the store. The operations run themselves.</h2>
          <ul className="mt-12 grid gap-px overflow-hidden rounded-lg bg-white/10 sm:grid-cols-2">
            {AUTOMATION.map((item) => (
              <li key={item.title} className="bg-ink-950 p-7">
                <item.icon className="size-6 text-iris-100" strokeWidth={1.5} aria-hidden />
                <h3 className="mt-5 text-lg font-semibold tracking-[-0.01em]">{item.title}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-white/70">{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container-page">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-ink-500">The catalogue</p>
              <h2 className="mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-[-0.03em] text-ink-950 md:text-5xl">Products ready to sell</h2>
              <p className="mt-3 max-w-xl text-[1.0625rem] text-ink-600">Every product shows what you pay, the suggested selling price and what you keep.</p>
            </div>
          </div>
          <div className="mt-10">
            <Suspense fallback={<div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="aspect-[4/5] rounded-md" />)}</div>}>
              <CatalogPreview />
            </Suspense>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-canvas py-16 md:py-20">
        <div className="container-page grid items-center gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-balance text-3xl font-semibold tracking-[-0.03em] text-ink-950 md:text-4xl">See what your customers will see</h2>
            <p className="mt-3 max-w-lg text-[1.0625rem] text-ink-600">Our demo store runs on exactly the same design and checkout your store gets. Browse it, add to the bag, try the search.</p>
          </div>
          <div className="flex md:justify-end">
            <a href={demoUrl} className="inline-flex h-13 items-center gap-2 rounded-md bg-ink-950 px-7 text-base font-medium text-white hover:bg-ink-800">
              Open the demo store <ArrowRight className="size-4" aria-hidden />
            </a>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container-page grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-ink-950 md:text-4xl">Questions</h2>
            <p className="mt-3 text-[1.0625rem] text-ink-600">
              Something else? <Link href="/contact" className="underline underline-offset-4">Get in touch</Link>.
            </p>
          </div>
          <div className="lg:col-span-8">
            {FAQ.map((item) => (
              <details key={item.q} className="group border-b border-line">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[1.0625rem] font-medium text-ink-950 [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span aria-hidden className="shrink-0 text-xl font-light leading-none text-ink-400 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="pb-5 text-[0.9375rem] leading-relaxed text-ink-600">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-20">
        <div className="container-page">
          <div className="rounded-lg bg-iris-600 px-6 py-14 text-center text-white md:px-12">
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-[-0.03em] md:text-5xl">Your store can be live in the next five minutes</h2>
            <p className="mx-auto mt-4 max-w-xl text-[1.0625rem] text-white/80">Name it, add a few products, share the link.</p>
            <ButtonLink href="/start" variant="inverse" size="lg" className="mt-8 gap-2">
              Create your store <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
