import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { Workflow } from '../models/database';
import { Types } from 'mongoose';
import { createApp } from '../app';
import {
  makeWorkflow,
  workflowRequestBody,
  postJson,
  postWithCookie,
  putWithCookie,
  authCookie,
  TEST_WORKFLOW_ID,
  TEST_USER_ID,
  readJson
} from './helpers';

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp();
});

afterEach(() => {
  mock.restore();
});

describe('POST /workflows', () => {
  it('should reject requests without auth', async () => {
    const result = await postJson(app, '/workflows', workflowRequestBody);

    expect(result.status).toBe(401);
  });

  it('persists the workflow before answering', async () => {
    // Stub the driver write; the real model (defaults, validation, save) runs
    const insertOne = spyOn(Workflow.collection, 'insertOne').mockResolvedValue({
      acknowledged: true,
      insertedId: new Types.ObjectId()
    } as never);

    const result = await postWithCookie(app, '/workflows', workflowRequestBody, await authCookie());

    expect(result.status).toBe(200);
    expect(insertOne).toHaveBeenCalledTimes(1);
    const inserted = insertOne.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(String(inserted.user)).toBe(TEST_USER_ID);
    const response = await readJson(result);
    expect(response.name).toBe(workflowRequestBody.name);
    expect(response.enabled).toBe(workflowRequestBody.enabled);
    expect(response.user).toBe(TEST_USER_ID);
  });

  it('returns 500 (not 200) when the save fails', async () => {
    spyOn(Workflow.collection, 'insertOne').mockRejectedValue(new Error('not primary'));

    const result = await postWithCookie(app, '/workflows', workflowRequestBody, await authCookie());

    expect(result.status).toBe(500);
    expect(await result.text()).toBe('Internal Server Error');
  });

  it('returns 422 for an empty name (nothing is saved)', async () => {
    const insertOne = spyOn(Workflow.collection, 'insertOne');

    const result = await postWithCookie(app, '/workflows', { name: '', enabled: true }, await authCookie());

    expect(result.status).toBe(422);
    expect(insertOne).not.toHaveBeenCalled();
  });

  it('should return 422 for invalid body', async () => {
    const result = await postWithCookie(app, '/workflows', { name: 'Missing enabled' }, await authCookie());

    expect(result.status).toBe(422);
  });
});

describe('PUT /workflows/:id', () => {
  it('should reject requests without auth', async () => {
    const result = await putWithCookie(app, `/workflows/${TEST_WORKFLOW_ID}`, workflowRequestBody, '');

    expect(result.status).toBe(401);
  });

  it('should update a workflow owned by the user', async () => {
    const workflow = makeWorkflow({ name: 'Old Name', enabled: false });
    const save = spyOn(workflow, 'save').mockResolvedValue(workflow as never);
    spyOn(Workflow, 'findById').mockResolvedValue(workflow as never);

    const result = await putWithCookie(
      app,
      `/workflows/${TEST_WORKFLOW_ID}`,
      workflowRequestBody,
      await authCookie()
    );

    expect(result.status).toBe(200);
    expect(save).toHaveBeenCalledTimes(1);
    const response = await readJson(result);
    expect(response.name).toBe(workflowRequestBody.name);
    expect(response.enabled).toBe(true);
  });

  it('returns 404 for a non-existent workflow', async () => {
    spyOn(Workflow, 'findById').mockResolvedValue(null as never);

    const fakeId = new Types.ObjectId().toString();
    const result = await putWithCookie(app, `/workflows/${fakeId}`, workflowRequestBody, await authCookie());

    expect(result.status).toBe(404);
  });

  it('returns 403 when the user is not the owner', async () => {
    const workflow = makeWorkflow({ user: new Types.ObjectId() });
    const save = spyOn(workflow, 'save').mockResolvedValue(workflow as never);
    spyOn(Workflow, 'findById').mockResolvedValue(workflow as never);

    const result = await putWithCookie(
      app,
      `/workflows/${TEST_WORKFLOW_ID}`,
      workflowRequestBody,
      await authCookie()
    );

    expect(result.status).toBe(403);
    expect(save).not.toHaveBeenCalled();
  });

  it('returns 422 for an id that is not an ObjectId', async () => {
    const findById = spyOn(Workflow, 'findById');

    const result = await putWithCookie(app, '/workflows/not-an-id', workflowRequestBody, await authCookie());

    expect(result.status).toBe(422);
    expect(findById).not.toHaveBeenCalled();
  });
});
