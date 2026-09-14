import { getWishlistProductIds } from "@/features/wishlist/service";
import { getCurrentUser } from "@/server/auth/session";
import { WishlistHydrator } from "./wishlist-provider";

export async function WishlistBootstrap() {
  const user = await getCurrentUser();
  const ids = user ? await getWishlistProductIds(user.id) : [];
  return <WishlistHydrator ids={ids} signedIn={!!user} />;
}
