import { redirect } from "next/navigation";

/** On the platform site, creating an account means opening a store. */
export default function RegisterPage() {
  redirect("/start");
}
