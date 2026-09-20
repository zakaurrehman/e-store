/**
 * Permission catalogue. Shared by the server (enforcement) and the admin UI (hiding controls).
 * Hiding a control is cosmetic — every server action and route handler re-checks permissions.
 */
export const PERMISSIONS = {
  "dashboard.view": { group: "Dashboard", description: "View the admin dashboard" },
  "analytics.view": { group: "Dashboard", description: "View sales and customer analytics" },

  "products.view": { group: "Catalogue", description: "View products" },
  "products.create": { group: "Catalogue", description: "Create and duplicate products" },
  "products.update": { group: "Catalogue", description: "Edit products, images, variants and SEO" },
  "products.delete": { group: "Catalogue", description: "Archive and delete products" },
  "products.import": { group: "Catalogue", description: "Import products from CSV or external sources" },
  "products.export": { group: "Catalogue", description: "Export products to CSV" },
  "inventory.update": { group: "Catalogue", description: "Adjust stock levels" },
  "catalog.manage": { group: "Catalogue", description: "Manage categories, brands, collections, tags and attributes" },
  "reviews.moderate": { group: "Catalogue", description: "Approve, reject, feature and delete reviews" },

  "orders.view": { group: "Orders", description: "View orders" },
  "orders.update": { group: "Orders", description: "Update order status, shipments and notes" },
  "orders.refund": { group: "Orders", description: "Issue refunds" },
  "orders.cancel": { group: "Orders", description: "Cancel orders" },

  "customers.view": { group: "Customers", description: "View customers and their history" },
  "customers.update": { group: "Customers", description: "Disable accounts and reset access" },
  "messages.view": { group: "Customers", description: "Read and resolve contact messages" },

  "stores.view": { group: "Stores", description: "View owners' stores, their products and sales" },
  "stores.manage": { group: "Stores", description: "Suspend and reopen stores" },

  "discounts.manage": { group: "Marketing", description: "Manage coupons and discounts" },
  "content.manage": { group: "Content", description: "Manage pages, banners, homepage, menus and FAQ" },
  "media.manage": { group: "Content", description: "Upload and manage media" },

  "shipping.manage": { group: "Settings", description: "Manage shipping zones, methods and tax rates" },
  "settings.manage": { group: "Settings", description: "Manage store settings" },
  "staff.manage": { group: "Settings", description: "Manage staff accounts, roles and permissions" },
  "audit.view": { group: "Settings", description: "View the audit log" },
} as const satisfies Record<string, { group: string; description: string }>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const SYSTEM_ROLES = {
  SUPER_ADMIN: {
    name: "Super admin",
    description: "Full access, including staff and permission management",
    rank: 100,
    isStaff: true,
    permissions: ALL_PERMISSIONS,
  },
  ADMIN: {
    name: "Admin",
    description: "Runs the store day to day; cannot manage staff roles",
    rank: 80,
    isStaff: true,
    permissions: ALL_PERMISSIONS.filter((permission) => permission !== "staff.manage"),
  },
  MANAGER: {
    name: "Manager",
    description: "Catalogue, orders, content and customer service",
    rank: 50,
    isStaff: true,
    permissions: [
      "dashboard.view",
      "analytics.view",
      "products.view",
      "products.create",
      "products.update",
      "products.export",
      "inventory.update",
      "catalog.manage",
      "reviews.moderate",
      "orders.view",
      "orders.update",
      "customers.view",
      "messages.view",
      "content.manage",
      "media.manage",
    ] satisfies Permission[],
  },
  STORE_OWNER: {
    name: "Store owner",
    description: "Runs their own Zendropship store from the owner dashboard",
    rank: 10,
    isStaff: false,
    permissions: [] as Permission[],
  },
  CUSTOMER: {
    name: "Customer",
    description: "Storefront customer account",
    rank: 0,
    isStaff: false,
    permissions: [] as Permission[],
  },
} as const;

export type SystemRoleKey = keyof typeof SYSTEM_ROLES;

export function hasPermission(granted: readonly string[] | ReadonlySet<string>, permission: Permission) {
  return granted instanceof Set ? granted.has(permission) : (granted as readonly string[]).includes(permission);
}
