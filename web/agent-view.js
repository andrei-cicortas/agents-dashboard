// The Agent tab: one named agent at a time, its threads as tabs, and the
// conversation underneath.
//
// Where the Code tab shows a terminal and lets you read it, this shows what the
// agent did — a line per thing said, per tool used, per failure — because a
// headless agent reports its work as events rather than as a screen.

import { h } from './dom.js';
import { icon } from './icons.js';
import { openMenu } from './menu.js';
import { createTranscript } from './transcript-view.js';
import { createComposer } from './composer.js';

const MODEL_NAMES = { opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku' };

const STATUS = {
  idle: { label: 'Ready', tone: 'ready' },
  working: { label: 'Working', tone: 'working' },
  failed: { label: 'Needs you', tone: 'failed' },
};

export function createAgentView(root, actions) {
  const face = h('span', { class: 'agent-face large' });
  const title = h('span', { class: 'agent-title' });
  const powered = h('span', { class: 'agent-powered' }, 'Powered by Claude Code');
  const statusPill = h('span', { class: 'status-pill' });
  const modelSelect = h('select', { class: 'model-select', title: 'Which model it answers with' });
  const gear = h('button', { class: 'icon-button', title: 'This agent' });
  const tabs = h('div', { class: 'thread-tabs' });
  const transcript = createTranscript({ empty: 'Nothing yet. Ask it something.' });

  const composer = createComposer({
    placeholder: 'Ask this agent to do anything',
    onSend: (text) => {
      if (!thread) return;
      transcript.follow();
      actions.sendToThread(thread.id, text);
    },
  });
  const footNote = h('div', { class: 'agent-foot' });

  const panel = h('div', { class: 'agent-panel' },
    h('div', { class: 'agent-head' },
      face,
      h('div', { class: 'agent-head-text' }, title, powered),
      modelSelect,
      statusPill,
      gear),
    tabs,
    transcript.element,
    composer.element,
    footNote);

  const blank = h('div', { class: 'empty' },
    h('div', { class: 'empty-title' }, 'No agent yet'),
    h('div', { class: 'empty-text' }, 'Name one, and give it a folder to work in.'),
    h('div', { class: 'empty-actions' },
      h('button', { class: 'button primary', onClick: () => actions.newProfile() }, 'New agent')));

  root.replaceChildren(blank, panel);

  // What the view is looking at, so handlers do not close over a stale render.
  let profile = null;
  let thread = null;

  modelSelect.addEventListener('change', () => {
    if (profile) actions.setProfileModel(profile.id, modelSelect.value);
  });

  gear.replaceChildren(icon('settings', { size: 15 }));
  gear.addEventListener('click', () => {
    if (!profile) return;
    openMenu(gear, [
      { label: profile.tools ? 'Only let it read' : 'Let it change files', onSelect: () => actions.setProfileTools(profile.id, !profile.tools) },
      { label: 'Open its folder in Explorer', onSelect: () => actions.openFolder(profile.cwd) },
      { label: 'Rename…', onSelect: () => actions.renameProfile(profile.id) },
      { label: 'Remove this agent', onSelect: () => actions.removeProfile(profile.id) },
    ]);
  });

  function drawTabs(threads) {
    const buttons = threads.map((one) => {
      const close = h('button', {
        class: 'icon-button tiny',
        title: 'Close this thread',
        onClick: (event) => {
          event.stopPropagation();
          actions.closeThread(one.id);
        },
      }, icon('close', { size: 11 }));
      return h('button', {
        class: `thread-tab${one.id === thread?.id ? ' active' : ''}`,
        onClick: () => actions.selectThread(one.id),
      }, h('span', { class: 'thread-name' }, one.title), close);
    });
    tabs.replaceChildren(...buttons, h('button', {
      class: 'icon-button',
      title: 'New thread',
      onClick: () => actions.createThread(profile.id),
    }, icon('plus', { size: 14 })));
  }

  return {
    render(model) {
      const { state } = model;
      if (!state) return;
      const profiles = state.profiles ?? [];
      profile = profiles.find((one) => one.id === model.selectedProfileId) ?? null;
      const mine = (state.threads ?? []).filter((one) => one.profileId === profile?.id);
      // Which thread is open is worked out in app.js, so the window can tell
      // the server what it is looking at without asking the view.
      thread = mine.find((one) => one.id === model.selectedThreadId) ?? null;

      blank.hidden = Boolean(profile);
      panel.hidden = !profile;
      if (!profile) return;

      face.textContent = profile.name.slice(0, 1).toUpperCase();
      face.style.background = profile.colour;
      title.textContent = profile.name;
      powered.textContent = profile.tools
        ? 'Powered by Claude Code · may change files'
        : 'Powered by Claude Code · reads only';

      const models = state.chatModels ?? [];
      const drawn = [...modelSelect.options].map((option) => option.value).join(',');
      if (drawn !== models.join(',')) {
        modelSelect.replaceChildren(...models.map((id) => h('option', { value: id }, MODEL_NAMES[id] ?? id)));
      }
      if (profile.model) modelSelect.value = profile.model;

      const status = STATUS[thread?.status ?? 'idle'] ?? STATUS.idle;
      statusPill.className = `status-pill ${status.tone}`;
      statusPill.replaceChildren(h('span', { class: 'dot' }), status.label);

      drawTabs(mine);

      if (!thread) {
        transcript.element.replaceChildren(h('div', { class: 'empty-text' }, 'No thread open. Click + above to start one.'));
        transcript.reset();
        composer.element.hidden = true;
        footNote.textContent = profile.cwd;
        return;
      }
      composer.element.hidden = false;
      composer.own(thread.id);

      transcript.show(thread);

      const working = thread.status === 'working';
      composer.setWorking(working);
      footNote.replaceChildren(h('span', {}, profile.cwd), working
        ? h('button', { class: 'link-button', onClick: () => actions.cancelThread(thread.id) }, 'Stop')
        : h('span', {}));
    },
  };
}
