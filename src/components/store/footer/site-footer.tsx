import { cacheLife } from "next/cache";
import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";
import { paymentProviderList } from "@/lib/env-value";
import { getCategoryTree } from "@/features/catalog/queries";
import { getMenu } from "@/features/cms/queries";
import { getStoreSettings } from "@/features/settings/queries";
import { NewsletterForm } from "./newsletter-form";

const PAYMENT_LABELS: Record<string, string[]> = {
  stripe: ["Visa", "Mastercard", "American Express", "Apple Pay", "Google Pay"],
  paypal: ["PayPal"],
  cod: ["Cash on delivery"],
};

const SOCIAL_LABELS: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", x: "X", youtube: "YouTube", pinterest: "Pinterest" };

/** The year is part of the static shell; refreshed daily. */
async function CopyrightYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

async function FooterColumn({ title, menuKey }: { title: string; menuKey: string }) {
  const links = await getMenu(menuKey);
  if (links.length === 0) return null;
  return (
    <div>
      <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-white/50">{title}</h2>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.id}>
            <Link href={link.href} className="text-[0.9375rem] text-white/80 transition-colors hover:text-white">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function SiteFooter() {
  const [settings, categories] = await Promise.all([getStoreSettings(), getCategoryTree()]);
  const providers = paymentProviderList(process.env.PAYMENT_PROVIDERS);
  const paymentMethods = [...new Set(providers.flatMap((provider) => PAYMENT_LABELS[provider] ?? []))];
  const socials = Object.entries(settings.social).filter(([, url]) => !!url);

  return (
    <footer className="bg-ink-950 text-white">
      <div className="container-page py-14 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Wordmark className="text-base text-white" />
            <p className="mt-5 max-w-sm text-[0.9375rem] leading-relaxed text-white/70">{settings.store.tagline}</p>
            <div className="mt-8 max-w-sm">
              <p className="text-[0.9375rem] font-medium">Get first access to new arrivals</p>
              <p className="mb-3 mt-1 text-[0.8125rem] text-white/60">No spam. Unsubscribe anytime.</p>
              <NewsletterForm tone="dark" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 lg:col-span-8">
            <div>
              <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-white/50">Shop</h2>
              <ul className="mt-4 space-y-2.5">
                {categories.map((category) => (
                  <li key={category.id}>
                    <Link href={`/c/${category.slug}`} className="text-[0.9375rem] text-white/80 transition-colors hover:text-white">
                      {category.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <FooterColumn title="Help" menuKey="footer-help" />
            <FooterColumn title="Company" menuKey="footer-company" />
            <FooterColumn title="Legal" menuKey="footer-legal" />
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-6 border-t border-white/10 pt-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.8125rem] text-white/60">
            <span>
              © <CopyrightYear /> {settings.store.legalName}
            </span>
            {settings.store.address && <span>{settings.store.address}</span>}
            {socials.length > 0 && (
              <ul className="flex gap-4">
                {socials.map(([key, url]) => (
                  <li key={key}>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                      {SOCIAL_LABELS[key] ?? key}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {paymentMethods.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Accepted payment methods">
              {paymentMethods.map((method) => (
                <li key={method} className="rounded-xs border border-white/15 px-2 py-1 text-[0.6875rem] font-medium tracking-[0.02em] text-white/70">
                  {method}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </footer>
  );
}
