"use client";

import { Plus } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { AddressFields, EMPTY_ADDRESS, toAddressForm, type AddressFormValue } from "@/components/store/checkout/address-fields";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, TextField } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { deleteAddressAction, saveAddressAction, setDefaultAddressAction } from "@/features/account/actions";
import { idleState, type ActionState } from "@/lib/action-state";
import { formatAddressLines, type AddressSnapshot } from "@/lib/address";

export type AddressRecord = AddressSnapshot & { id: string; label: string | null; isDefaultShipping: boolean };

function AddressForm({ address, onDone }: { address: AddressRecord | null; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await saveAddressAction(prev, formData);
      if (result.status === "success") onDone();
      return result;
    },
    idleState,
  );
  const [value, setValue] = useState<AddressFormValue>(address ? toAddressForm(address) : EMPTY_ADDRESS);
  const fieldErrors = state.status === "error" ? state.fieldErrors ?? {} : {};
  return (
    <form action={action} className="space-y-5">
      {address && <input type="hidden" name="id" value={address.id} />}
      {/* Hidden mirrors keep the controlled fields in the submitted FormData under the API field names. */}
      {(Object.keys(value) as Array<keyof AddressFormValue>).map((key) => (
        <input key={key} type="hidden" name={key} value={value[key]} />
      ))}
      <TextField name="label" label="Label" optional placeholder="Home, Office…" defaultValue={address?.label ?? ""} maxLength={40} error={fieldErrors.label} />
      <AddressFields value={value} onChange={setValue} errors={fieldErrors} idPrefix="addr" />
      <Checkbox id="addr-default" name="isDefaultShipping" defaultChecked={address?.isDefaultShipping ?? false} label="Use as my default address" />
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>{address ? "Save changes" : "Add address"}</SubmitButton>
      </div>
    </form>
  );
}

export function AddressBook({ addresses }: { addresses: AddressRecord[] }) {
  const [editing, setEditing] = useState<AddressRecord | null | "new">(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const run = (promise: Promise<ActionState>) =>
    startTransition(async () => {
      const result = await promise;
      if (result.status === "error") toast({ title: result.message, tone: "error" });
      else if (result.status === "success" && result.message) toast({ title: result.message });
    });

  return (
    <div>
      {addresses.length === 0 ? (
        <EmptyState title="No saved addresses" description="Save an address to speed up checkout." action={<Button onClick={() => setEditing("new")}>Add address</Button>} className="py-10" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {addresses.map((address) => (
            <li key={address.id} className="flex flex-col rounded-md border border-line p-5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">{address.label ?? "Address"}</p>
                {address.isDefaultShipping && <span className="rounded-xs bg-canvas px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-700">Default</span>}
              </div>
              <address className="mt-2 flex-1 text-[0.9375rem] not-italic leading-relaxed text-ink-800">
                {formatAddressLines(address).map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <button type="button" onClick={() => setEditing(address)} className="font-medium text-ink-950 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-950">
                  Edit
                </button>
                {!address.isDefaultShipping && (
                  <button type="button" disabled={pending} onClick={() => run(setDefaultAddressAction(address.id))} className="text-ink-600 underline decoration-ink-300 underline-offset-4 hover:text-ink-950">
                    Make default
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm("Remove this address?")) run(deleteAddressAction(address.id));
                  }}
                  className="text-ink-600 underline decoration-ink-300 underline-offset-4 hover:text-danger"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setEditing("new")} className="flex h-full min-h-40 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong text-sm font-medium text-ink-700 transition-colors hover:border-ink-950 hover:text-ink-950">
              <Plus className="size-5" aria-hidden /> Add a new address
            </button>
          </li>
        </ul>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add address" : "Edit address"} className="w-[min(calc(100vw-2rem),36rem)]">
        {editing !== null && <AddressForm key={editing === "new" ? "new" : editing.id} address={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}
