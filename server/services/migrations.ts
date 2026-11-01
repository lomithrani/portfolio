import mongoose from 'mongoose';
import type { mongo } from 'mongoose';
import { logger } from './logger';

export interface CompanyMigrationResult {
  embedded: number;
  removed: number;
}

/**
 * Experiences used to reference a document of the shared `companies`
 * collection (`company: ObjectId`). They now embed their own copy
 * (`company: { name, summary?, svg? }`). This rewrites every legacy reference
 * in place from the referenced company, and drops references whose company no
 * longer exists (or has no name). Idempotent: once nothing is an ObjectId any
 * more it is a single empty query. The `companies` collection is left as is.
 */
export const embedLegacyCompanies = async (
  db = mongoose.connection.db
): Promise<CompanyMigrationResult> => {
  if (!db) throw new Error('MongoDB is not connected');

  const experiences = db.collection('experiences');
  const legacy = await experiences
    .find({ company: { $type: 'objectId' } }, { projection: { company: 1 } })
    .toArray();
  if (legacy.length === 0) return { embedded: 0, removed: 0 };

  const companyIds = [...new Set(legacy.map((experience) => String(experience.company)))];
  const companies = await db
    .collection('companies')
    .find({ _id: { $in: companyIds.map((id) => new mongoose.Types.ObjectId(id)) } })
    .toArray();
  const byId = new Map(companies.map((company) => [String(company._id), company]));

  let embedded = 0;
  let removed = 0;
  const operations: mongo.AnyBulkWriteOperation<mongo.Document>[] = legacy.map((experience) => {
    const company = byId.get(String(experience.company));
    const name = typeof company?.name === 'string' ? company.name.trim() : '';
    // Match on the ObjectId too, so a concurrent edit that already replaced it wins
    const filter = { _id: experience._id, company: experience.company };

    if (!name) {
      removed++;
      return { updateOne: { filter, update: { $unset: { company: '' } } } };
    }

    embedded++;
    const copy: Record<string, string> = { name };
    if (typeof company?.summary === 'string' && company.summary) copy.summary = company.summary;
    if (typeof company?.svg === 'string' && company.svg) copy.svg = company.svg;
    return { updateOne: { filter, update: { $set: { company: copy } } } };
  });

  await experiences.bulkWrite(operations, { ordered: false });
  return { embedded, removed };
};

/** Runs the data migrations at startup; a failure is logged, never fatal. */
export const runMigrations = async () => {
  try {
    const result = await embedLegacyCompanies();
    if (result.embedded || result.removed) {
      logger.info('Migrated legacy experience companies', { ...result });
    }
  } catch (error) {
    logger.error('Legacy company migration failed (experiences keep working without company)', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
