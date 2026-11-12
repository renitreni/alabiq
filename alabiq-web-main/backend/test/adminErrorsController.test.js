require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const controller = require('../controllers/adminErrorsController');

function res() {
  return { statusCode: 200, body: null, status(code) { this.statusCode=code; return this; }, json(body) { this.body=body; return this; } };
}

test('error search binds all filters and keeps pagination in PostgreSQL', async (t) => {
  const calls=[];
  t.mock.method(database, 'query', async (sql, values) => {
    calls.push({sql,values});
    return sql.includes('count(*)') ? { rows: [{total:1}] } : { rows: [{id:'err-1'}] };
  });
  const response=res();
  await controller.listErrors({ query: { q: "' OR true --", severity:'error', limit:'10', offset:'2' } }, response);
  assert.equal(response.body.total,1);
  assert.equal(response.body.errors[0].id,'err-1');
  assert.equal(calls[0].sql.includes("' OR true"),false);
  assert.ok(calls[0].values.includes("' or true --"));
});

test('resolving an error closes every occurrence with the same fingerprint', async (t) => {
  const calls=[];
  t.mock.method(database, 'query', async (sql) => {
    calls.push(sql);
    if (sql.startsWith('SELECT')) return { rows: [{ id:'err-1', fingerprint:'fp-1', label:'network' }] };
    return { rowCount: 3, rows: [] };
  });
  const response=res();
  await controller.resolveError({ params:{id:'err-1'}, body:{resolved:true}, adminId:'admin-1' }, response);
  assert.equal(response.body.updated,3);
  assert.ok(calls.some((sql) => sql.startsWith('UPDATE public.error_logs')));
});
