import { InferSchemaType, Schema, Types, model } from "mongoose";

export const companySchema = new Schema({
  _id: Types.ObjectId,
  name: { type: String, required: true },
  summary: String,
  svg: String,
});


export type Company = InferSchemaType<typeof companySchema>;
export const Company = model('Company', companySchema);