import { Schema, Types, InferSchemaType, model } from 'mongoose';

const experienceSchema = new Schema(
  {
    name: { type: String, required: true },
  },
  {
    methods: {
      displayInConsole() {
        console.log(`${this.name}!`);
      },
    },
  }
);

export type Experience = InferSchemaType<typeof experienceSchema>;
export const Experience = model('Experience', experienceSchema);