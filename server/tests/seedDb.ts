import mongoose from "mongoose";
import { Domain, User } from "../models/database";

await mongoose.connect(Bun.env.MONGO_URL ?? '');

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
