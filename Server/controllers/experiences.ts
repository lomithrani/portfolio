import { Experience } from '../models';
import { t } from 'elysia'

const getAllExperiences = async () => await Experience.find();

const getAllExperiencesDescription = {
  response: t.Array(t.Object({
    name: t.String()
  }), { description: "List of experiences" })
}

export { getAllExperiences, getAllExperiencesDescription }