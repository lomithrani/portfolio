// Suites that write to MongoDB (integration, eden) only run against a local
// server or an explicit TEST_MONGO_URL, never against whatever MONGO_URL a
// developer's server/.env points at (possibly a shared or production database).

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/** Host names of a MongoDB connection string; undefined when it is not one */
export const mongoHosts = (url: string): string[] | undefined => {
  const match = /^mongodb(?:\+srv)?:\/\/([^/?]*)/.exec(url);
  if (!match) return undefined;
  // Credentials end at the last '@' (an '@' inside them must be percent-encoded)
  const hostList = match[1].slice(match[1].lastIndexOf('@') + 1);
  return hostList
    .split(',')
    .map((host) => (host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.split(':')[0]))
    .map((host) => host.toLowerCase());
};

/** True when tests may write to this database */
export const isDisposableDatabase = (
  url: string,
  testMongoUrl: string | undefined = process.env.TEST_MONGO_URL
) => {
  // An explicit TEST_MONGO_URL is the developer saying "this one is disposable"
  if (testMongoUrl) return true;
  const hosts = mongoHosts(url);
  return !!hosts && hosts.length > 0 && hosts.every((host) => LOCAL_HOSTS.has(host));
};

/** Throws (failing the suite) unless MONGO_URL is safe to write test data to */
export const assertDisposableDatabase = (url = process.env.MONGO_URL ?? '') => {
  if (isDisposableDatabase(url)) return;
  throw new Error(
    'Refusing to write test data: MONGO_URL is not a local MongoDB. Point MONGO_URL at ' +
      'localhost, or set TEST_MONGO_URL to a disposable database, to run this suite.'
  );
};
