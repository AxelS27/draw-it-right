import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('live drawing keeps the preview canvas, tools, chat, header and reveal layout', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { DrawingRound } = await vite.ssrLoadModule('/src/DrawingRound.tsx');
    const props = { options: { rounds: 3, timer: 30, doublePoints: true }, round: 1, prompt: 'cat', messages: [], onSend() {}, onBack() {}, onSubmit() {} };
    const preview = renderToStaticMarkup(createElement(DrawingRound, props));
    const live = renderToStaticMarkup(createElement(DrawingRound, { ...props, live: { revealing: true, remaining: 3, submitted: false, async onSubmit() {}, async onDraft() {} } }));
    for (const part of ['drawing-page', 'drawing-heading', 'drawing-editor', 'drawing-reveal', 'drawing-paper', 'drawing-tools', 'drawing-actions', 'drawing-chat', 'drawing-clear']) {
      assert.ok(preview.includes(part), `Preview should include ${part}`);
      assert.ok(live.includes(part), `Live match should reuse ${part}`);
    }
    assert.match(preview, /PREVIEW/);
    assert.match(live, /LIVE MATCH/);
  } finally { await vite.close(); }
});
