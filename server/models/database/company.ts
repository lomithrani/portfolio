import { Schema, model } from "mongoose";
import type { InferSchemaType, Model, Types } from "mongoose";

export const companySchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  summary: String,
  svg: String,
});

export type Company = InferSchemaType<typeof companySchema>;

export interface CompanyInput {
  name: string;
  summary?: string;
  svg?: string;
}

interface CompanyModel extends Model<Company> {
  /**
   * Returns the id of the company with this name, creating it if needed.
   * Returns undefined when no company (or an empty name) is given.
   */
  findOrCreate(company?: CompanyInput): Promise<Types.ObjectId | undefined>;
}

const isDuplicateKeyError = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;

companySchema.statics.findOrCreate = async function (company?: CompanyInput) {
  const name = company?.name?.trim();
  if (!name) return undefined;

  // Details only seed a new company; existing companies are shared and kept
  const onInsert: Partial<CompanyInput> = { name };
  if (company?.summary) onInsert.summary = company.summary;
  if (company?.svg) onInsert.svg = company.svg;

  // Atomic upsert on the unique name; two concurrent inserts make one fail
  // with a duplicate key error, and the retry then finds the winner's doc
  const upsert = () =>
    this.findOneAndUpdate({ name }, { $setOnInsert: onInsert }, { upsert: true, returnDocument: 'after' });

  let doc;
  try {
    doc = await upsert();
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    doc = await upsert();
  }
  return doc._id;
};

export const Company = model<Company, CompanyModel>('Company', companySchema);
