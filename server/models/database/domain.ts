import { Schema, model, Types } from "mongoose";
import { User, Experience } from ".";

export interface Domain extends Document {
  name: string;
  admin: Types.ObjectId | User;
  experiences: (Types.ObjectId | Experience)[],
  style?: string;
  defaultDarkMode?: boolean;
}

export const domainSchema = new Schema<Domain>({
  name: {
    type: String,
    required: true,
    index: true,
    unique: true,
    validate: {
      validator: function (value: string) {
        return /^(?!-)[A-Za-z0-9\-\.]{1,63}(?<!-)$/.test(value);
      },
      message: (props: { value: string }) => `${props.value} is not a valid subdomain!`
    },
  },
  admin: { type: Types.ObjectId, ref: 'User', index: true, required: true },
  experiences: [{ type: Types.ObjectId, ref: 'Experience', required: true }],
  style: { type: String },
  defaultDarkMode: { type: Boolean }
});


export const Domain = model<Domain>('Domain', domainSchema);