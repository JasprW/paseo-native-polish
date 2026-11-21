import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import * as preferences from "../client/preferences.ts";
import * as toolDetailMotion from "../client/tool-detail-motion.ts";

function loadTsx(path, modules) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require(specifier) {
      assert.ok(Object.hasOwn(modules, specifier), `Unexpected dependency: ${specifier}`);
      return modules[specifier];
    },
  });
  return exports;
}

const { StreamingAssistant } = loadTsx("../client/streaming-markdown.tsx", {
  "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
  "react-native": { View: "view" },
  "@getpaseo/plugin/client/ui": { Markdown: "host-markdown" },
  "./tool-detail-motion": toolDetailMotion,
});

test("the streaming renderer passes every interval chunk to Paseo Markdown", () => {
  let text = "";
  for (const delta of ["Use ", "[0, 1) for all values.", " The bound is exclusive."]) {
    text += delta;
    const row = StreamingAssistant({ item: { data: { text } } });
    assert.equal(row.props.children.type, "host-markdown");
    assert.equal(row.props.children.props.children, text);
  }
});

test("the plugin releases a live assistant row when either motion switch is off", () => {
  const { defaults, setPreferences } = preferences;
  const { default: contribute } = loadTsx("../index.client.tsx", {
    "react-native": { Platform: { OS: "web" } },
    "zod": { z },
    "./client/settings": {},
    "./client/preferences": preferences,
    "./client/streaming-markdown": { StreamingAssistant },
    "./client/web": {
      installMotion() {
        // The web adapter restores the saved preferences before first use.
        setPreferences({ ...defaults, messages: false });
        return () => {};
      },
    },
  });
  let transformer;
  const client = {
    addSettingsScreen: () => () => {},
    addCommandCenterItem: () => () => {},
    addTimelineRenderer: () => () => {},
    addTimelineTransformer(contribution) {
      assert.equal(transformer, undefined, "only one replacement may be registered at a time");
      transformer = contribution;
      return () => { transformer = undefined; };
    },
  };
  // The source item stays the same while the host has no new streaming delta.
  const item = { type: "assistant_message", text: "Use [0, 1) for all values." };
  const render = (phase = "streaming") => transformer?.transform({ item, phase })?.items[0] ?? item;
  const dispose = contribute(client);
  try {
    assert.equal(render(), item, "saved New messages preference keeps the host row");
    setPreferences(defaults);
    assert.equal(render().data.text, item.text);
    assert.equal(render("complete"), item);
    setPreferences({ ...defaults, enabled: false, timeline: true });
    assert.equal(render(), item, "turning off Enable motion releases the current row");
    setPreferences({ ...defaults, timeline: false });
    assert.equal(render().data.text, item.text, "Thinking's switch leaves the assistant renderer active");
    setPreferences({ ...defaults, messages: false, timeline: true });
    assert.equal(render(), item, "turning off New messages releases the current row");
    setPreferences(defaults);
    assert.equal(render().type, "plugin");
  } finally {
    dispose();
    setPreferences(defaults);
  }
  assert.equal(render(), item, "disposal removes the transformer and its subscription");
});
