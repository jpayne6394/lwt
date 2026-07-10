import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("social listening SQL generator emits deterministic summarized blog feed seed", async () => {
  const { stdout } = await execFileAsync("node", ["scripts/generate-social-listening-seed-sql.mjs"], {
    cwd: process.cwd(),
  });

  assert.match(stdout, /Apply only to the LWT Supabase project: udqjdegsqxfvaocuuvab/);
  assert.match(stdout, /insert into source_items/);
  assert.match(stdout, /curated_social_listening_seed/);
  assert.match(stdout, /source_manual_listening_magnesium_20260710/);
  assert.match(stdout, /Which magnesium form should I take/);
  assert.match(stdout, /insert into content_ideas/);
  assert.match(stdout, /Magnesium Forms Explained Through Real Routine Questions/);
  assert.match(stdout, /insert into agent_memory_documents/);
  assert.match(stdout, /memory_lwt_social_listening_blog_structure_20260710/);
  assert.doesNotMatch(stdout, /raw comment dump/i);
});
