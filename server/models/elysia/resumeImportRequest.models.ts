import { t } from "elysia";

// Body of POST /experiences/import. The file's size and type are checked by
// services/resumeImport.ts (413 / 422 with a clear message, not a schema
// error); its length is bounded by the server's request body cap (app.ts).
export const resumeImportRequest = t.Object({
  file: t.String({
    minLength: 1,
    description:
      'The PDF, base64-encoded (standard alphabet, padded). A data:application/pdf;base64, prefix is accepted'
  }),
  fileName: t.Optional(
    t.String({ maxLength: 255, description: 'Name of the uploaded file, given to the model as the document title' })
  )
})
