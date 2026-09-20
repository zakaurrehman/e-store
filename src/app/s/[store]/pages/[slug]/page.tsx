import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { MarkdownContent } from "@/components/ui/markdown";
import { Skeleton } from "@/components/ui/misc";
import { getPublishedPage } from "@/features/cms/queries";

export async function generateMetadata({ params }: PageProps<"/s/[store]/pages/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublishedPage(slug);
  if (!page) return { title: "Page not found", robots: { index: false } };
  return { title: page.seoTitle ?? page.title, description: page.seoDescription ?? page.excerpt ?? undefined, alternates: { canonical: `/pages/${slug}` } };
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

async function PageContent({ params }: PageProps<"/s/[store]/pages/[slug]">) {
  const { slug } = await params;
  const page = await getPublishedPage(slug);
  if (!page) notFound();
  return (
    <>
      <Breadcrumbs items={[{ name: page.title, href: `/pages/${page.slug}` }]} />
      <article className="mx-auto mt-8 max-w-3xl">
        <header>
          <h1 className="text-balance text-4xl font-semibold tracking-[-0.03em] text-ink-950 md:text-5xl">{page.title}</h1>
          {page.excerpt && <p className="mt-4 text-lg leading-relaxed text-ink-600">{page.excerpt}</p>}
          <p className="mt-4 text-[0.8125rem] text-ink-400">Last updated {dateFormat.format(page.updatedAt)}</p>
        </header>
        <div className="mt-10">
          <MarkdownContent content={page.content} className="text-[1.0625rem]" />
        </div>
      </article>
    </>
  );
}

export default function CmsPage(props: PageProps<"/s/[store]/pages/[slug]">) {
  return (
    <div className="container-page pb-24 pt-6">
      <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-3xl" />}>
        <PageContent {...props} />
      </Suspense>
    </div>
  );
}
