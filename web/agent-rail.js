// The list of named agents, in the sidebar, while the Agent tab is open. The
// agent being looked at sits at the top as a card; the rest are rows showing
// what each of them is doing.

import { h } from './dom.js';
import { icon } from './icons.js';
import { openMenu } from './menu.js';
import { createFolderPicker } from './folder-picker.js';

const MODEL_NAMES = { opus: 'Answers with Opus', sonnet: 'Answers with Sonnet', haiku: 'Answers with Haiku' };

// What the rail says an agent is up to, from its threads.
function standing(profile, threads) {
  const mine = threads.filter((thread) => thread.profileId === profile.id);
  const working = mine.find((thread) => thread.status === 'working');
  if (working) return { text: working.title, tone: 'working' };
  const failed = mine.find((thread) => thread.status === 'failed');
  if (failed) return { text: 'Needs you', tone: 'failed' };
  const last = mine.at(-1);
  return { text: last ? last.title : 'No threads yet', tone: 'idle' };
}

export function createAgentRail(root, actions) {
  const list = h('div', { class: 'sidebar-scroll' });
  const form = h('div', { class: 'agent-form' });
  form.hidden = true;

  const nameInput = h('input', { class: 'field', type: 'text', placeholder: 'Name, e.g. Release notes writer' });
  // Any folder on the disk, not only one already added as a workspace: an
  // agent answering about a folder is not the same as sitting a terminal in it.
  const folderInput = h('input', { class: 'field', type: 'text', spellcheck: 'false', placeholder: 'Folder it works in' });
  const browseButton = h('button', { class: 'button', onClick: () => picker.toggle() }, 'Browse…');
  const picker = createFolderPicker({
    actions,
    chooseLabel: 'Use this folder',
    onChoose: (folder) => {
      folderInput.value = folder;
      picker.close();
    },
  });
  const modelSelect = h('select', { class: 'field', title: 'Which model it answers with' });
  const instructionsInput = h('textarea', { class: 'field', rows: '3', placeholder: 'What should it always do? (optional)' });
  const formMessage = h('div', { class: 'add-message' });
  formMessage.hidden = true;

  function closeForm() {
    form.hidden = true;
    picker.close();
    nameInput.value = '';
    instructionsInput.value = '';
    formMessage.hidden = true;
  }

  function submit() {
    const name = nameInput.value.trim();
    if (!name) return nameInput.focus();
    const cwd = folderInput.value.trim();
    if (!cwd) {
      formMessage.textContent = 'Give it a folder to work in.';
      formMessage.hidden = false;
      return picker.open();
    }
    actions.createProfile({ name, cwd, instructions: instructionsInput.value, model: modelSelect.value });
    closeForm();
  }

  form.replaceChildren(
    nameInput,
    h('div', { class: 'folder-bar' }, folderInput, browseButton),
    picker.element,
    modelSelect,
    instructionsInput,
    formMessage,
    h('div', { class: 'form-actions' },
      h('button', { class: 'button', onClick: closeForm }, 'Cancel'),
      h('button', { class: 'button primary', onClick: submit }, 'Add agent')),
  );
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit();
    if (event.key === 'Escape') closeForm();
  });

  const addButton = h('button', {
    class: 'icon-button',
    title: 'Add an agent',
    onClick: () => {
      form.hidden = !form.hidden;
      if (form.hidden) closeForm();
      else nameInput.focus();
    },
  }, icon('plus'));

  root.replaceChildren(
    h('div', { class: 'sidebar-header' }, h('span', { class: 'title' }, 'Agents'), addButton),
    form,
    list);

  function card(profile, model) {
    const gear = h('button', {
      class: 'icon-button',
      title: 'This agent',
      onClick: (event) => {
        event.stopPropagation();
        openMenu(gear, [
          { label: profile.tools ? 'Only let it read' : 'Let it change files', onSelect: () => actions.setProfileTools(profile.id, !profile.tools) },
          { label: 'Remove this agent', onSelect: () => actions.removeProfile(profile.id) },
        ]);
      },
    }, icon('settings', { size: 14 }));

    return h('div', { class: 'agent-card' },
      h('span', { class: 'agent-face large', style: { background: profile.colour } }, profile.name.slice(0, 1).toUpperCase()),
      h('span', { class: 'agent-card-name' }, profile.name),
      h('div', { class: 'agent-card-actions' }, gear));
  }

  function row(profile, model) {
    const { text, tone } = standing(profile, model.state.threads ?? []);
    return h('div', {
      class: 'agent-row-item',
      title: profile.cwd,
      onClick: () => actions.selectProfile(profile.id),
    },
      h('span', { class: 'agent-face', style: { background: profile.colour } }, profile.name.slice(0, 1).toUpperCase()),
      h('div', { class: 'agent-lines' },
        h('span', { class: 'agent-name' }, profile.name),
        h('span', { class: `agent-doing ${tone}` }, text)));
  }

  return {
    render(model) {
      const { state } = model;
      if (!state) return;
      const profiles = state.profiles ?? [];

      const models = state.chatModels ?? [];
      const drawn = [...modelSelect.options].map((option) => option.value).join(',');
      if (drawn !== models.join(',')) {
        modelSelect.replaceChildren(...models.map((id) => h('option', { value: id }, MODEL_NAMES[id] ?? id)));
      }

      const selected = profiles.find((profile) => profile.id === model.selectedProfileId);
      const rest = profiles.filter((profile) => profile !== selected);
      const content = [];
      if (selected) content.push(card(selected, model));
      content.push(...rest.map((profile) => row(profile, model)));
      if (!profiles.length) {
        content.push(h('div', { class: 'sidebar-empty' }, 'No agents yet. Click + to name one.'));
      }
      list.replaceChildren(...content);
    },
  };
}
