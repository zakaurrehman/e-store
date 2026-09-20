import { buildCartSnapshot } from "@/features/cart/snapshot";
import { getCurrentCart } from "@/features/cart/session";
import { getCurrentUser } from "@/server/auth/session";
import { CartHydrator } from "./cart-provider";

export async function CartBootstrap({ storeId }: { storeId: Promise<string> }) {
  const id = await storeId;
  const [user, cart] = await Promise.all([getCurrentUser(), getCurrentCart(id)]);
  const snapshot = await buildCartSnapshot(cart, { userId: user?.id ?? null, email: user?.email ?? null });
  return <CartHydrator snapshot={snapshot} />;
}
