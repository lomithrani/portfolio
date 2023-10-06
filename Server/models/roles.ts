export enum UserRole {
  Admin = "admin",
  Recruiter = "recruiter",
  Test = "test"
}

import * as mongoose from 'mongoose';

const roleSchema = new mongoose.Schema({
  email: { type: String, required: true },
  roles: {
    type: [String],
    enum: Object.values(UserRole),
    default: []
  }
});

export type Role = mongoose.Document & {
  email: string;
  roles: UserRole[];
};

export const Role = mongoose.model<Role>('Role', roleSchema);