/** True for MongoDB's duplicate key error (E11000), raised by unique indexes */
export const isDuplicateKeyError = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
