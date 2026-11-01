import { describe, it, expect } from 'bun:test';
import { isDisposableDatabase, mongoHosts } from './testDatabase';

describe('test database guard', () => {
  it('parses the hosts of a connection string', () => {
    expect(mongoHosts('mongodb://user:p%40ss@Db1.example.com:27017,[::1]:27018/app?replicaSet=rs')).toEqual([
      'db1.example.com',
      '::1'
    ]);
    expect(mongoHosts('not a url')).toBeUndefined();
  });

  it.each([
    'mongodb://127.0.0.1:27017/wf-server',
    'mongodb://localhost/mytestdb',
    'mongodb://[::1]:27017/portfolio'
  ])('lets the suites write to a local database (%s)', (url) => {
    expect(isDisposableDatabase(url, '')).toBe(true);
  });

  it.each([
    'mongodb+srv://user:secret@cluster0.abcde.mongodb.net/portfolio',
    'mongodb://localhost:27017,db.example.com:27017/portfolio',
    ''
  ])('refuses any other database (%s)', (url) => {
    expect(isDisposableDatabase(url, '')).toBe(false);
  });

  it('trusts an explicit TEST_MONGO_URL', () => {
    expect(isDisposableDatabase('mongodb+srv://cluster0.example.net/ci', 'mongodb+srv://cluster0.example.net/ci')).toBe(true);
  });
});
