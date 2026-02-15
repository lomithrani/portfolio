import Elysia, { t } from 'elysia';
import { corsConf } from './corsConf';
import { userLogged } from './userLogged';
import { Workflow } from '../models/database';
import { workflowRequest } from '../models/elysia';
import { Types } from 'mongoose';

export const workflows = new Elysia()
  .use(corsConf())
  .use(userLogged)
  .post('/workflows', async ({ body, userId }) => {

    const user = new Types.ObjectId(userId);
    const workflow = new Workflow({ ...body })
    workflow.user = user;
    workflow.save();

    return workflow.toObject();
  },
    {
      body: workflowRequest,
      detail: {
        summary: 'Add new workflow'
      }
    })
  .put('/workflows/:id', async ({ body, userId, params: { id } }) => {
    if (!id) throw new Error('Id is required')

    const workflow = await Workflow.findById(id);

    if (!workflow) throw new Error('Workflow not found')

    if (workflow.user.toString() !== userId) {
      throw new Error('Unauthorized')
    }

    workflow.set({ ...body })

    await workflow.save();

    return workflow.toObject()
  },
    {
      body: workflowRequest,
      detail: {
        summary: 'Edit workflow'
      }
    })