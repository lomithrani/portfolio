import Elysia from 'elysia';
import { userLogged } from './userLogged';
import { Workflow } from '../models/database';
import { objectIdParams, workflowRequest } from '../models/elysia';
import { Types } from 'mongoose';
import { ForbiddenError, ResourceNotFoundError } from '../errors';

export const workflows = new Elysia()
  .use(userLogged)
  .post('/workflows', async ({ body, userId }) => {
    // Awaited: a failed save must surface as an error response, not a 200
    const workflow = await Workflow.create({ ...body, user: new Types.ObjectId(userId) });

    return workflow.toObject();
  },
    {
      body: workflowRequest,
      detail: {
        summary: 'Add new workflow'
      }
    })
  .put('/workflows/:id', async ({ body, userId, params: { id } }) => {
    const workflow = await Workflow.findById(id);

    if (!workflow) throw new ResourceNotFoundError('Workflow not found')

    if (workflow.user.toString() !== userId) {
      throw new ForbiddenError('Forbidden: not the workflow owner')
    }

    workflow.set({ ...body })

    await workflow.save();

    return workflow.toObject()
  },
    {
      params: objectIdParams,
      body: workflowRequest,
      detail: {
        summary: 'Edit workflow'
      }
    })
