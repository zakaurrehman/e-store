import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/json-ld";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { getFaqItems } from "@/features/cms/queries";

export const metadata: Metadata = {
  title: "Help & FAQ",
  description: "Answers about orders, delivery, returns, payments and your account.",
  alternates: { canonical: "/faq" },
};

export default async function FaqPage() {
  const groups = await getFaqItems();
  return (
    <div className="container-page pb-24 pt-6">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: groups.flatMap((group) => group.items.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } }))),
        }}
      />
      <Breadcrumbs items={[{ name: "Help & FAQ", href: "/faq" }]} />
      <div className="mt-8 grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h1 className="text-4xl font-semibold tracking-[-0.03em] md:text-5xl">Help & FAQ</h1>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-ink-600">Quick answers to the questions we hear most. Can’t find what you need? Our team replies within one business day.</p>
          <ButtonLink href="/contact" className="mt-6">
            Contact us
          </ButtonLink>
          <nav aria-label="FAQ sections" className="mt-10 hidden lg:block">
            <ul className="space-y-2 text-[0.9375rem]">
              {groups.map((group) => (
                <li key={group.group}>
                  <Link href={`#${group.group.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="text-ink-600 hover:text-ink-950">
                    {group.group}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="lg:col-span-8">
          {groups.map((group) => (
            <section key={group.group} id={group.group.toLowerCase().replace(/[^a-z0-9]+/g, "-")} className="scroll-mt-24 border-t border-line py-8 first:border-t-0 first:pt-0">
              <h2 className="text-2xl font-semibold tracking-[-0.02em]">{group.group}</h2>
              <div className="mt-4">
                {group.items.map((item) => (
                  <details key={item.id} className="group border-b border-line">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-[1.0625rem] font-medium text-ink-950 [&::-webkit-details-marker]:hidden">
                      {item.question}
                      <span aria-hidden className="shrink-0 text-xl font-light leading-none text-ink-400 transition-transform group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="pb-5 text-[0.9375rem] leading-relaxed text-ink-600">{item.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
