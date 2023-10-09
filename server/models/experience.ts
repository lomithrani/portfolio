import * as mongoose from 'mongoose';

const experienceSchema = new mongoose.Schema(
  {
    name: {type: String, required: true},
  },
  {
    methods: {
      displayInConsole() {
        console.log(`${this.name}!`);
      },
    },
  }
);

export type Experience = mongoose.InferSchemaType<typeof experienceSchema>;
export const Experience = mongoose.model('Experience', experienceSchema);