import { Heart } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

async function WishlistGate() {
  const user = await getCurrentUser();
  if (user) redirect("/account/wishlist");
  return (
    <div className="container-page py-16">
      <EmptyState
        icon={<Heart className="size-6" strokeWidth={1.5} />}
        title="Save your favourites"
        description="Sign in to keep a wishlist that follows you across devices."
        action={
          <>
            <ButtonLink href="/login?next=/account/wishlist">Sign in</ButtonLink>
            <ButtonLink href="/register?next=/account/wishlist" variant="secondary">
              Create account
            </ButtonLink>
          </>
        }
      />
    </div>
  );
}

export default function WishlistPage() {
  return (
    <Suspense fallback={null}>
      <WishlistGate />
    </Suspense>
  );
}
