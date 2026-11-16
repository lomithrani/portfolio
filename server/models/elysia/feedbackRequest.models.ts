import { t } from "elysia";
import { FEEDBACK_LIMITS } from "portfolio-common";

// POST /feedback: what a signed-in person wrote in the "Send feedback"
// dialog, and where. The rules are portfolio-common's parseFeedback, checked
// by the route on the cleaned text: the length here only leaves room for the
// spaces and invisible characters cleaning removes. The context is a help to
// the maintainers, never a reason to refuse the feedback: its fields are
// whatever the client sent, and parseFeedbackContext keeps what keeps its
// rules (unknown keys are dropped there too)
export const feedbackRequest = t.Object({
  message: t.String({ maxLength: FEEDBACK_LIMITS.message * 2 }),
  context: t.Optional(
    t.Object(
      {
        route: t.Optional(t.Unknown()),
        viewport: t.Optional(t.Unknown()),
        theme: t.Optional(t.Unknown())
      },
      { additionalProperties: true }
    )
  )
});
