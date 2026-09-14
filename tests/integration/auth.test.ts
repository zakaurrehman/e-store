import { describe, expect, it } from "vitest";
import { authenticate, MAX_FAILED_LOGINS, registerCustomer } from "@/features/auth/service";
import { UserStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";

const password = "Correct-Horse-42!";
let sequence = 0;
const nextEmail = () => `customer.${++sequence}@example.com`;

describe("authentication", () => {
  it("stores only an Argon2id hash and authenticates with the correct password", async () => {
    const email = nextEmail();
    const { user, verificationToken } = await registerCustomer({ email, password, firstName: "Ada", lastName: "Tester" });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(password);
    expect(verificationToken).toBeTruthy();

    await expect(authenticate(email, "Wrong-Horse-42!")).rejects.toThrow();
    const signedIn = await authenticate(email, password);
    expect(signedIn.id).toBe(user.id);
    expect(signedIn.role.key).toBe("CUSTOMER");
    expect(signedIn.role.isStaff).toBe(false);
  });

  it("rejects duplicate emails and weak passwords", async () => {
    const email = nextEmail();
    await registerCustomer({ email, password, firstName: "Grace", lastName: "Tester" });
    await expect(registerCustomer({ email, password, firstName: "Grace", lastName: "Again" })).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
    await expect(registerCustomer({ email: nextEmail(), password: "password", firstName: "Weak", lastName: "Password" })).rejects.toMatchObject({ code: "PASSWORD_WEAK" });
  });

  it("gives the same error for an unknown email as for a wrong password", async () => {
    const email = nextEmail();
    await registerCustomer({ email, password, firstName: "Alan", lastName: "Tester" });
    const unknown = await authenticate("nobody@example.com", password).catch((error: Error) => error.message);
    const wrong = await authenticate(email, "Wrong-Horse-42!").catch((error: Error) => error.message);
    expect(unknown).toBe(wrong);
  });

  it("locks the account after repeated failed sign-ins", async () => {
    const email = nextEmail();
    await registerCustomer({ email, password, firstName: "Lock", lastName: "Tester" });
    for (let attempt = 0; attempt < MAX_FAILED_LOGINS; attempt++) {
      await expect(authenticate(email, `Wrong-Horse-${attempt}!`)).rejects.toThrow();
    }
    await expect(authenticate(email, password)).rejects.toMatchObject({ code: "ACCOUNT_LOCKED" });
  });

  it("refuses disabled accounts even with the correct password", async () => {
    const email = nextEmail();
    const { user } = await registerCustomer({ email, password, firstName: "Off", lastName: "Tester" });
    await db.user.update({ where: { id: user.id }, data: { status: UserStatus.DISABLED } });
    await expect(authenticate(email, password)).rejects.toMatchObject({ code: "ACCOUNT_DISABLED" });
  });
});
