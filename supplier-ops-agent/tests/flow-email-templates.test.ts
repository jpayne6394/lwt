import assert from "node:assert/strict";
import test from "node:test";

import { FLOW_EMAIL_TEMPLATES, templatePlainTextForFlow } from "../src/campaigns/flow-email-templates.ts";

test("Flow email template library includes professional customer and internal templates", () => {
  assert.ok(FLOW_EMAIL_TEMPLATES.length >= 5);
  assert.ok(FLOW_EMAIL_TEMPLATES.some((template) => template.id === "first-purchase-welcome"));
  assert.ok(FLOW_EMAIL_TEMPLATES.some((template) => template.id === "post-purchase-education"));
  assert.ok(FLOW_EMAIL_TEMPLATES.some((template) => template.audience === "internal"));

  for (const template of FLOW_EMAIL_TEMPLATES) {
    assert.ok(template.subject.includes("{{") || template.audience === "internal");
    assert.ok(template.body.includes("Living Well Today"));
    assert.ok(template.flowTrigger.length > 10);
    assert.ok(template.setupSteps.length >= 3);
  }
});

test("Flow email templates render copy-paste friendly text", () => {
  const text = templatePlainTextForFlow(FLOW_EMAIL_TEMPLATES[0]);

  assert.match(text, /Subject:/);
  assert.match(text, /Preview text:/);
  assert.match(text, /Body:/);
  assert.match(text, /Flow trigger:/);
  assert.match(text, /Living Well Today/);
});
