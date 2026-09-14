"use client";

import { Field, Input, Select, TextField } from "@/components/ui/field";
import { COUNTRIES } from "@/lib/countries";
import type { AddressSnapshot } from "@/lib/address";

export type AddressFormValue = {
  firstName: string;
  lastName: string;
  company: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
};

export const EMPTY_ADDRESS: AddressFormValue = { firstName: "", lastName: "", company: "", line1: "", line2: "", city: "", region: "", postalCode: "", country: "US", phone: "" };

export function toAddressForm(address: Partial<AddressSnapshot> | null | undefined): AddressFormValue {
  return {
    firstName: address?.firstName ?? "",
    lastName: address?.lastName ?? "",
    company: address?.company ?? "",
    line1: address?.line1 ?? "",
    line2: address?.line2 ?? "",
    city: address?.city ?? "",
    region: address?.region ?? "",
    postalCode: address?.postalCode ?? "",
    country: address?.country ?? "US",
    phone: address?.phone ?? "",
  };
}

const REGION_LABELS: Record<string, string> = { US: "State", CA: "Province", AU: "State", GB: "County", IN: "State", BR: "State", MX: "State", DE: "State", JP: "Prefecture" };
const POSTAL_LABELS: Record<string, string> = { US: "ZIP code", GB: "Postcode", CA: "Postal code", AU: "Postcode", IE: "Eircode" };

type Props = {
  value: AddressFormValue;
  onChange: (value: AddressFormValue) => void;
  errors?: Record<string, string[]>;
  prefix?: string;
  idPrefix: string;
  showPhone?: boolean;
  allowedCountries?: string[] | "*";
};

export function AddressFields({ value, onChange, errors = {}, prefix = "", idPrefix, showPhone = true, allowedCountries = "*" }: Props) {
  const error = (name: string) => errors[`${prefix}${name}`];
  const set = (name: keyof AddressFormValue) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [name]: event.target.value });
  const countries = allowedCountries === "*" ? COUNTRIES : COUNTRIES.filter((country) => allowedCountries.includes(country.code));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Country" htmlFor={`${idPrefix}-country`} error={error("country")} className="sm:col-span-2">
        <Select id={`${idPrefix}-country`} value={value.country} onChange={set("country")} autoComplete="country">
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </Select>
      </Field>
      <TextField name={`${idPrefix}-firstName`} id={`${idPrefix}-firstName`} label="First name" autoComplete="given-name" value={value.firstName} onChange={set("firstName")} error={error("firstName")} />
      <TextField name={`${idPrefix}-lastName`} id={`${idPrefix}-lastName`} label="Last name" autoComplete="family-name" value={value.lastName} onChange={set("lastName")} error={error("lastName")} />
      <TextField name={`${idPrefix}-company`} id={`${idPrefix}-company`} label="Company" optional autoComplete="organization" value={value.company} onChange={set("company")} error={error("company")} wrapperClassName="sm:col-span-2" />
      <TextField name={`${idPrefix}-line1`} id={`${idPrefix}-line1`} label="Street address" autoComplete="address-line1" value={value.line1} onChange={set("line1")} error={error("line1")} wrapperClassName="sm:col-span-2" />
      <TextField name={`${idPrefix}-line2`} id={`${idPrefix}-line2`} label="Apartment, suite, etc." optional autoComplete="address-line2" value={value.line2} onChange={set("line2")} error={error("line2")} wrapperClassName="sm:col-span-2" />
      <TextField name={`${idPrefix}-city`} id={`${idPrefix}-city`} label="City" autoComplete="address-level2" value={value.city} onChange={set("city")} error={error("city")} />
      <TextField name={`${idPrefix}-region`} id={`${idPrefix}-region`} label={REGION_LABELS[value.country] ?? "State / region"} optional={!["US", "CA", "AU"].includes(value.country)} autoComplete="address-level1" value={value.region} onChange={set("region")} error={error("region")} hint={value.country === "US" ? "Two-letter code, e.g. CA" : undefined} />
      <TextField name={`${idPrefix}-postalCode`} id={`${idPrefix}-postalCode`} label={POSTAL_LABELS[value.country] ?? "Postal code"} autoComplete="postal-code" value={value.postalCode} onChange={set("postalCode")} error={error("postalCode")} />
      {showPhone && (
        <Field label="Phone" htmlFor={`${idPrefix}-phone`} error={error("phone")} hint="For delivery updates only." optional>
          <Input id={`${idPrefix}-phone`} type="tel" autoComplete="tel" value={value.phone} onChange={set("phone")} />
        </Field>
      )}
    </div>
  );
}

export function addressFormToInput(value: AddressFormValue) {
  return {
    firstName: value.firstName,
    lastName: value.lastName,
    company: value.company || undefined,
    line1: value.line1,
    line2: value.line2 || undefined,
    city: value.city,
    region: value.region || undefined,
    postalCode: value.postalCode,
    country: value.country,
    phone: value.phone || undefined,
  };
}
