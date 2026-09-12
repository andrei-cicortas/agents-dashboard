// Workspaces rail: pinned projects, then every other folder, each with its
// agents underneath.

import { h } from './dom.js';
import { icon } from './icons.js';
import { openMenu } from './menu.js';
import { panelLabel } from '/shared/labels.js';
import { dotClass, folderState, sameFolder } from '/shared/status.js';
import { createFolderPicker } from './folder-picker.js';

export function createSidebar(root, actions) {
  const scroll = h('div', { class: 'sidebar-scroll' });
  function agentRow(panel, model) {
    const selected = panel.id === model.focusedPanelId;
    return h('div', {
      class: `agent-row${selected ? ' selected' : ''}`,
      // The row shows what the agent is doing when it has said so; the full
      // label and folder stay in the tooltip.
      title: `${panelLabel(panel)}\n${panel.cwd}`,
      onClick: () => actions.focusPanel(panel.id),
    }, h('span', { class: `dot ${dotClass(panel)}` }),
    h('span', { class: 'label' }, panel.kind === 'browser' ? panelLabel(panel) : (panel.title || panel.agentName)));
  }

  function projectBlock(project, model) {
    const { state } = model;
    const panels = state.panels.filter((panel) => sameFolder(panel.cwd, project.path));
    const open = !model.collapsedProjects.has(project.path);

    const addButton = h('button', {
      class: 'icon-button',
      title: 'Start an agent in this folder',
      onClick: (event) => {
        event.stopPropagation();
        openMenu(addButton, [
          ...state.agents.map((agent) => ({
            label: `New ${agent.name}`,
            onSelect: () => actions.createPanel(agent.id, project.path),
          })),
          { label: 'New web page', onSelect: () => actions.createBrowserPane(project.path) },
        ]);
      },
    }, icon('plus', { size: 14 }));

    const moreButton = h('button', {
      class: 'icon-button',
      title: 'More',
      onClick: (event) => {
        event.stopPropagation();
        openMenu(moreButton, [
          { label: project.pinned ? 'Unpin' : 'Pin to top', onSelect: () => actions.pinProject(project.path, !project.pinned) },
          {
            label: panels.length ? 'Remove from list (close its agents first)' : 'Remove from list',
            disabled: panels.length > 0,
            onSelect: () => actions.removeProject(project.path),
          },
        ]);
      },
    }, icon('more', { size: 14 }));

    // Clicking the row opens the workspace on the canvas; the chevron on its
    // own only folds the list of panels underneath it. A folder with nothing
    // to fold gets a blank of the same width, so every name stays in line.
    const chevron = panels.length ? h('button', {
      class: 'icon-button chevron',
      title: open ? 'Hide its agents' : 'Show its agents',
      onClick: (event) => {
        event.stopPropagation();
        actions.toggleProject(project.path);
      },
    }, icon(open ? 'chevronDown' : 'chevronRight', { size: 14 })) : h('span', { class: 'chevron-space' });

    // Folded, the count is the only thing left saying what is going on
    // inside, so it carries the colour the dots would have.
    const { tone, note } = folderState(panels);
    const selected = sameFolder(project.path, model.selectedWorkspace ?? '');
    const row = h('div', {
      class: `project-row${selected ? ' selected' : ''}`,
      title: project.path,
      onClick: () => actions.selectWorkspace(project.path),
    },
      chevron,
      h('span', { class: 'label' }, project.name),
      h('span', { class: `count ${tone}`, title: panels.length ? note : '' }, panels.length ? String(panels.length) : ''),
      h('span', { class: 'row-actions' }, addButton, moreButton));

    return h('div', { class: 'project' }, row, open && panels.length ? panels.map((panel) => agentRow(panel, model)) : []);
  }

  const picker = createFolderPicker({
    actions,
    onChoose: (folder) => actions.addProject(folder),
    windowsDialog: true,
  });

  const addButton = h('button', {
    class: 'icon-button',
    title: 'Add a project folder',
    onClick: () => picker.toggle(),
  }, icon('plus'));

  const header = h('div', { class: 'sidebar-header' },
    h('span', { class: 'title' }, 'Workspaces'),
    addButton);
  root.replaceChildren(header, picker.element, scroll);

  return {
    // Shown under the browser when the server would not take the path.
    addFailed(message) {
      picker.failed(message);
    },

    // Opened from somewhere other than the + beside the header.
    openPicker() {
      if (!picker.isOpen()) picker.open();
    },

    render(model) {
      const { state } = model;
      if (!state) return;

      // The folder arrived, so the browser has done its job.
      const chosen = picker.current();
      if (picker.isOpen() && chosen && state.projects.some((project) => sameFolder(project.path, chosen))) picker.close();

      const pinned = state.projects.filter((project) => project.pinned);
      const others = state.projects.filter((project) => !project.pinned);
      const content = [];
      if (pinned.length) {
        content.push(h('div', { class: 'section-label' }, 'Pinned'), ...pinned.map((p) => projectBlock(p, model)));
      }
      if (others.length) {
        content.push(h('div', { class: 'section-label' }, 'Folders'), ...others.map((p) => projectBlock(p, model)));
      }
      if (!state.projects.length) {
        content.push(h('div', { class: 'sidebar-empty' }, 'No workspaces yet. Click + to add a project folder.'));
      }
      scroll.replaceChildren(...content);


    },
  };
}
