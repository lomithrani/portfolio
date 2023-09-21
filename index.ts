import mongoose from 'mongoose';
import { Experience } from './models/experience'

await mongoose.connect(Bun.env.MONGO_URL ?? '');

const server = Bun.serve({
  hostname: "::",
  port: process.env.PORT ?? 3000,
  fetch(request) {
    return new Response(`Welcome to Bun !${Bun.env.MONGO}`);
  },
});

const experience = new Experience({
  name: 'Test'
});

await experience.save();

const experiences = await Experience.find();

experiences.forEach(experience => {
  experience.displayInConsole();
});

console.log(`Listening on http://localhost:${server.port}`);
