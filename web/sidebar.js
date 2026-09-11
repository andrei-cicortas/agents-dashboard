// Workspaces sidebar: pinned and other projects, with their agents underneath.

import { h } from './dom.js';
import { icon } from './icons.js';
import { openMenu } from './menu.js';
import { panelLabel } from '/shared/labels.js';
import { dotClass, sameFolder } from '/shared/status.js';

export function createSidebar(root, actions) {
  function agentRow(panel, model) {
    const selected = panel.id === model.focusedPanelId;
    return h('div', {
      class: `agent-row${selected ? ' selected' : ''}`,
      title: panelLabel(panel),
      onClick: () => actions.focusPanel(panel.id),
    }, h('span', { class: `dot ${dotClass(panel)}` }), h('span', { class: 'label' }, panelLabel(panel)));
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
        openMenu(addButton, state.agents.map((agent) => ({
          label: `New ${agent.name}`,
          onSelect: () => actions.createPanel(agent.id, project.path),
        })));
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

    const row = h('div', { class: 'project-row', title: project.path, onClick: () => actions.toggleProject(project.path) },
      icon(open ? 'chevronDown' : 'chevronRight', { size: 14 }),
      h('span', { class: 'label' }, project.name),
      h('span', { class: 'count' }, panels.length ? String(panels.length) : ''),
      h('span', { class: 'row-actions' }, addButton, moreButton));

    return h('div', { class: 'project' }, row, open ? panels.map((panel) => agentRow(panel, model)) : []);
  }

  return {
    render(model) {
      const { state } = model;
      if (!state) return;
      const header = h('div', { class: 'sidebar-header' },
        'Workspaces',
        h('button', { class: 'icon-button', title: 'Add a project folder', onClick: () => actions.addProject() }, icon('plus')));

      const pinned = state.projects.filter((project) => project.pinned);
      const others = state.projects.filter((project) => !project.pinned);
      const content = [];
      if (pinned.length) {
        content.push(h('div', { class: 'section-label' }, 'Pinned'), ...pinned.map((p) => projectBlock(p, model)));
        if (others.length) content.push(h('div', { class: 'section-label' }, 'Workspaces'));
      }
      content.push(...others.map((p) => projectBlock(p, model)));
      if (!state.projects.length) {
        content.push(h('div', { class: 'sidebar-empty' }, 'No workspaces yet. Click + to add a project folder.'));
      }
      root.replaceChildren(header, ...content);
    },
  };
}
