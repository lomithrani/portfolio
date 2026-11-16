import Elysia from 'elysia';
import { userLogged } from './userLogged';
import { feedbackRequest } from '../models/elysia';
import { feedbackStatus, sendFeedback } from '../services/feedback';
import type { FeedbackResultDto, FeedbackStatusDto } from '../services/feedback';

// Feedback (services/feedback.ts): a signed-in person reports a bug or shares
// an idea from the "Send feedback" dialog; the API classifies it with Claude
// (bug, feature, task) and files it as an issue of that type in the project's
// GitHub repository, without their name. Off without GITHUB_ISSUES_TOKEN.
// The classification is optional: without ANTHROPIC_API_KEY (or when Claude
// fails), the feedback is still filed, as a Task, not classified.

const feedbackPublic = new Elysia()
  // Whether the dialog can send: public, so the client knows before anything is typed
  .get('/feedback', (): FeedbackStatusDto => feedbackStatus(), {
    detail: { summary: 'Whether this server takes feedback, and whether it classifies it automatically' }
  });

const feedbackSend = new Elysia()
  .use(userLogged)
  .post(
    '/feedback',
    ({ userId, body, request }): Promise<FeedbackResultDto> =>
      sendFeedback(userId, body, { userAgent: request.headers.get('user-agent') ?? undefined }),
    {
      body: feedbackRequest,
      detail: {
        summary: "Send feedback: classified (bug, feature, task) and filed as an issue in the project's GitHub repository"
      }
    }
  );

export const feedback = new Elysia().use(feedbackPublic).use(feedbackSend);
