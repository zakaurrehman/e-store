import { beforeAll } from "vitest";
import { resetPaymentRegistry } from "@/server/payments/registry";
import { resetDatabase } from "./helpers";

// Every test file starts from an empty, freshly seeded test database.
beforeAll(async () => {
  await resetDatabase();
  resetPaymentRegistry();
});
