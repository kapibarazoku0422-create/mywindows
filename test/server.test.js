'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
test('required production files exist', () => {
  const fs=require('node:fs');
  for(const file of ['server.js','public/index.html','public/app.js','render.yaml','agent/agent.py']) assert.equal(fs.existsSync(file),true,file);
});
