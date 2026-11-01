import { Schema } from "mongoose";
import type { InferSchemaType } from "mongoose";

/**
 * The company of an experience, embedded in it: each experience owns its own
 * copy, so no tenant can change what another tenant's portfolio shows.
 */
export const companySchema = new Schema({
  name: { type: String, required: true, trim: true },
  summary: String,
  svg: String,
}, { _id: false });

export type Company = InferSchemaType<typeof companySchema>;

export interface CompanyInput {
  name: string;
  summary?: string;
  svg?: string;
}

/**
 * The company to store for a request: undefined when no company (or a blank
 * name, the admin form's default) is given. Only known fields are kept.
 */
export const companyFromRequest = (company?: CompanyInput): Company | undefined => {
  const name = company?.name?.trim();
  if (!name) return undefined;

  const result: Company = { name };
  if (company?.summary) result.summary = company.summary;
  if (company?.svg) result.svg = company.svg;
  return result;
};
