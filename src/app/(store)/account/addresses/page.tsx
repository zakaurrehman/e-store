import type { Metadata } from "next";
import { Suspense } from "react";
import { AddressBook } from "@/components/store/account/address-book";
import { AccountSection } from "@/components/store/account/section";
import { Skeleton } from "@/components/ui/misc";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Addresses", robots: { index: false } };

async function Addresses() {
  const user = await requireUser("/account/addresses");
  const addresses = await db.address.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: [{ isDefaultShipping: "desc" }, { createdAt: "asc" }] });
  return (
    <AccountSection title="Addresses" description="Saved addresses are offered at checkout.">
      <AddressBook
        addresses={addresses.map((address) => ({
          id: address.id,
          label: address.label,
          isDefaultShipping: address.isDefaultShipping,
          firstName: address.firstName,
          lastName: address.lastName,
          company: address.company,
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          region: address.region,
          postalCode: address.postalCode,
          country: address.country,
          phone: address.phone,
        }))}
      />
    </AccountSection>
  );
}

export default function AddressesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Addresses />
    </Suspense>
  );
}
