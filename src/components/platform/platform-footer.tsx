import { cacheLife } from "next/cache";
import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";
import { getMenu } from "@/features/cms/queries";
import { getStoreSettings } from "@/features/settings/queries";
import { DEMO_STORE_SLUG, storeUrl } from "@/lib/tenancy";

async function CopyrightYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

export async function PlatformFooter() {
  const [settings, legal] = await Promise.all([getStoreSettings(), getMenu("footer-legal")]);
  const columns = [
    {
      title: "Platform",
      links: [
        { label: "Browse the catalogue", href: "/catalog" },
        { label: "Create your store", href: "/start" },
        { label: "How it works", href: "/#how-it-works" },
        { label: "See a demo store", href: storeUrl(DEMO_STORE_SLUG) },
      ],
    },
    {
      title: "Store owners",
      links: [
        { label: "Sign in", href: "/login" },
        { label: "Your dashboard", href: "/dashboard" },
        { label: "Reset your password", href: "/forgot-password" },
      ],
    },
    { title: "Legal", links: legal.map((link) => ({ label: link.label, href: link.href })) },
  ];
  return (
    <footer className="bg-ink-950 text-white">
      <div className="container-page py-14 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Wordmark className="text-base text-white" />
            <p className="mt-5 max-w-sm text-[0.9375rem] leading-relaxed text-white/70">Open an online store, choose products from our catalogue, and let us ship every order.</p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-8">
            {columns.map((column) =>
              column.links.length === 0 ? null : (
                <div key={column.title}>
                  <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-white/50">{column.title}</h2>
                  <ul className="mt-4 space-y-2.5">
                    {column.links.map((link) => (
                      <li key={link.href}>
                        <Link href={link.href} className="text-[0.9375rem] text-white/80 transition-colors hover:text-white">
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )}
          </div>
        </div>
        <div className="mt-14 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-8 text-[0.8125rem] text-white/60">
          <span>
            © <CopyrightYear /> {settings.store.legalName}
          </span>
          {settings.store.address && <span>{settings.store.address}</span>}
          {settings.store.supportEmail && (
            <a href={`mailto:${settings.store.supportEmail}`} className="hover:text-white">
              {settings.store.supportEmail}
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
