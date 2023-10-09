import mongoose from 'mongoose';
import { Elysia } from 'elysia'
import { experiences, googleAuth } from './plugins';
import { validateEnvironment } from './services/validation';
import swagger from '@elysiajs/swagger';
import { Company, Experience, Project, Skill } from './models';
import { ExperienceType } from 'portfolio-common/models';

validateEnvironment();

await mongoose.connect(Bun.env.MONGO_URL ?? '');

const app = new Elysia()
  .use(googleAuth)
  .use(experiences)
  .use(swagger())
  .listen({
    hostname: Bun.env.HOSTNAME || "::",
    port: Bun.env.PORT || 3000,
    tls: Bun.env.TLS_PASSPHRASE ? {
      cert: Bun.file('./cert.pem'),
      key: Bun.file('./key.pem'),
      passphrase: Bun.env.TLS_PASSPHRASE
    } : undefined
  })
/*
const hardskill: Skill = new Skill({ name: 'TypeScript', level: 3, svg: 'ts' })
const softSkill: Skill = new Skill({ name: 'Autonomy', level: 2 })

const project: Project = new Project({
  name: 'Project Name',
  summary: 'Summary of what I have done during those months',
  hardSkills: [hardskill],
  softSkills: [softSkill],
  start: new Date(),
  end: new Date()
})

const company: Company = new Company({
  _id: new mongoose.Types.ObjectId(),
  name: 'Tech Corp',
  summary: 'A technology company.',
  svg: '<svg></svg>',
})

const newExperience = new Experience({
  _id: new mongoose.Types.ObjectId(),
  type: ExperienceType.Professional,  // Assuming `ExperienceType.Work` is a valid enum value.
  company: company,
  summary: 'Developed a web app.',
  title: 'Software Developer',
  projects: [project],
})


await newExperience.save()*/
console.log(`Running at http://${app.server!.hostname}:${app.server!.port} CORS allowed: ${JSON.stringify(Bun.env.ALLOWED_DOMAINS)}`)

export type Portfolio = typeof app;
