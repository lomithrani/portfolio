import * as mongoose from 'mongoose';

const roleSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    roles: { type: [String], default: [] }
  }
);

export type Role = mongoose.InferSchemaType<typeof roleSchema>;
export const Role = mongoose.model('Role', roleSchema);