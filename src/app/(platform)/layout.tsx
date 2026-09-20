import { PlatformFooter } from "@/components/platform/platform-footer";
import { PlatformHeader } from "@/components/platform/platform-header";

/** The platform site on the base domain: marketing, the catalogue, sign-up and sign-in for store owners. */
export default function PlatformLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a href="#main" className="sr-only z-50 rounded-sm bg-ink-950 px-4 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <PlatformHeader />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <PlatformFooter />
    </>
  );
}
