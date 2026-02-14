import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { User, Workflow } from '../models/database';
import { Types } from 'mongoose';
import { createApp } from '../app';
import {
  testUser,
  testWorkflow,
  workflowRequestBody,
  postJson,
  postWithCookie,
  putWithCookie,
  loginAndGetCookie,
  TEST_WORKFLOW_ID,
  TEST_USER_ID,
} from './helpers';

let app: ReturnType<typeof createApp>;
let originalFetch: typeof global.fetch;

beforeEach(() => {
  originalFetch = global.fetch;
  app = createApp();

  // Default mocks for auth flow
  User.findOneAndUpdate = mock(() => Promise.resolve(testUser)) as any;
  User.findById = mock(() => Promise.resolve(testUser)) as any;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('POST /workflows', () => {
  it('should reject requests without auth', async () => {
    const result = await postJson(app, '/workflows', workflowRequestBody);

    expect(result.status).not.toBe(200);
  });

  it('should create a workflow with valid auth and body', async () => {
    const cookie = await loginAndGetCookie(app);

    // Mock the Workflow constructor and save
    const saveMock = mock(() => Promise.resolve());
    const mockWorkflowInstance = {
      ...workflowRequestBody,
      _id: TEST_WORKFLOW_ID,
      user: null as any,
      steps: [],
      save: saveMock,
      toObject: () => ({
        _id: TEST_WORKFLOW_ID,
        name: workflowRequestBody.name,
        enabled: workflowRequestBody.enabled,
        description: workflowRequestBody.description,
      }),
    };

    // We need to mock the Workflow constructor — intercept via prototype
    const originalWorkflow = Workflow;
    // Since Workflow is a Mongoose model (constructor), we mock at the prototype level
    // The plugin does `new Workflow({...body})`, so we mock the model's constructor behavior
    // through Mongoose's internal create pattern
    Workflow.prototype.save = saveMock;
    Workflow.prototype.toObject = () => ({
      _id: TEST_WORKFLOW_ID,
      name: workflowRequestBody.name,
      enabled: workflowRequestBody.enabled,
      description: workflowRequestBody.description,
    });

    const result = await postWithCookie(app, '/workflows', workflowRequestBody, cookie);

    expect(result.status).toBe(200);
    const response = await result.json();
    expect(response.name).toBe(workflowRequestBody.name);
    expect(response.enabled).toBe(workflowRequestBody.enabled);
  });

  it('should return 422 for invalid body', async () => {
    const cookie = await loginAndGetCookie(app);

    const result = await postWithCookie(app, '/workflows', { name: 'Missing enabled' }, cookie);

    expect(result.status).toBe(422);
  });
});

describe('PUT /workflows/:id', () => {
  it('should reject requests without auth', async () => {
    const result = await putWithCookie(app, `/workflows/${TEST_WORKFLOW_ID}`, workflowRequestBody, '');

    expect(result.status).not.toBe(200);
  });

  it('should update a workflow owned by the user', async () => {
    const cookie = await loginAndGetCookie(app);

    const saveMock = mock(() => Promise.resolve());
    const setMock = mock(function (this: any, data: any) { Object.assign(this, data); });

    Workflow.findById = mock(() =>
      Promise.resolve({
        _id: TEST_WORKFLOW_ID,
        user: new Types.ObjectId(TEST_USER_ID),
        name: 'Old Name',
        enabled: false,
        set: setMock,
        save: saveMock,
        toObject: () => ({
          _id: TEST_WORKFLOW_ID,
          ...workflowRequestBody,
        }),
      })
    ) as any;

    const result = await putWithCookie(
      app,
      `/workflows/${TEST_WORKFLOW_ID}`,
      workflowRequestBody,
      cookie
    );

    expect(result.status).toBe(200);
    const response = await result.json();
    expect(response.name).toBe(workflowRequestBody.name);
  });

  it('should return error for non-existent workflow', async () => {
    const cookie = await loginAndGetCookie(app);

    Workflow.findById = mock(() => Promise.resolve(null)) as any;

    const fakeId = new Types.ObjectId().toString();
    const result = await putWithCookie(app, `/workflows/${fakeId}`, workflowRequestBody, cookie);

    expect(result.status).not.toBe(200);
  });

  it('should return error when user is not the owner', async () => {
    const cookie = await loginAndGetCookie(app);

    const differentUserId = new Types.ObjectId();
    Workflow.findById = mock(() =>
      Promise.resolve({
        _id: TEST_WORKFLOW_ID,
        user: differentUserId,
        name: 'Someone Elses Workflow',
        set: mock(() => {}),
        save: mock(() => Promise.resolve()),
        toObject: () => ({}),
      })
    ) as any;

    const result = await putWithCookie(
      app,
      `/workflows/${TEST_WORKFLOW_ID}`,
      workflowRequestBody,
      cookie
    );

    expect(result.status).not.toBe(200);
  });
});
