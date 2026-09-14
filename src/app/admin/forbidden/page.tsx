import { ShieldOff } from "lucide-react";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { PERMISSIONS, type Permission } from "@/lib/permissions";

async function Forbidden({ searchParams }: PageProps<"/admin/forbidden">) {
  const { permission } = await searchParams;
  const meta = typeof permission === "string" && permission in PERMISSIONS ? PERMISSIONS[permission as Permission] : null;
  return (
    <EmptyState
      icon={<ShieldOff className="size-6" strokeWidth={1.5} />}
      title="You don't have access to this area"
      description={meta ? `This page requires the “${meta.description}” permission. Ask a super admin to update your role.` : "Ask a super admin to update your role if you need access."}
      action={<ButtonLink href="/admin">Back to dashboard</ButtonLink>}
      className="py-24"
    />
  );
}

export default function ForbiddenPage(props: PageProps<"/admin/forbidden">) {
  return (
    <Suspense fallback={null}>
      <Forbidden {...props} />
    </Suspense>
  );
}
