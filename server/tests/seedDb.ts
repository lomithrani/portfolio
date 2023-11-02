import mongoose from "mongoose";
import { Domain, User } from "../models/database";

console.log(`Connecting to : ${Bun.env.MONGO_URL}`)

await mongoose.connect(Bun.env.MONGO_URL ?? '');

console.log(`Connected to : ${Bun.env.MONGO_URL}`)

const user = new User({
  email: 'louisgentil89@gmail.com',
  name: 'Louis',
  surname: 'Gentil'
});

await user.save();

const domain = new Domain({
  admin: user.id,
  experiences: [],
  name: 'louis.gentil'
});

await domain.save();

console.log('Seeded');
process.exit(0);
