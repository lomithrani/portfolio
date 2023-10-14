import { InferSchemaType, Schema, model } from "mongoose";

export const domainSchema = new Schema({
  name: {
    type: String,
    required: true,
    index: true,
    unique: true,
    validate: {
      validator: function (value: string) {
        return /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$/.test(value);
      },
      message: (props: { value: string }) => `${props.value} is not a valid subdomain!`
    },
  },
  admin: { type: Schema.Types.ObjectId, ref: 'User' },
  experiences: [{ type: Schema.Types.ObjectId, ref: 'Experience' }],
  style: { type: String },
  defaultDarkMode: { type: Boolean }
});

export type Domain = InferSchemaType<typeof domainSchema>;
export const Domain = model('Domain', domainSchema);