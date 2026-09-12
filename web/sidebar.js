// Workspaces sidebar: pinned projects, then every other folder, each with its
// agents underneath, and an account card in the footer.

import { h } from './dom.js';
import { icon } from './icons.js';
import { openMenu } from './menu.js';
import { panelLabel } from '/shared/labels.js';
import { dotClass, isActive, sameFolder } from '/shared/status.js';
import { THEMES } from '/shared/themes.js';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function createSidebar(root, actions) {
  const scroll = h('div', { class: 'sidebar-scroll' });
  // The footer carries what a hosted app would put in its account slot: who is
  // at this PC, what is running, and the two settings that belong to the window
  // rather than to any agent.
  const avatar = h('span', { class: 'avatar' });
  const accountName = h('span', { class: 'account-name' });
  const accountMeta = h('span', { class: 'account-meta' });
  const themeButton = h('button', {
    class: 'icon-button',
    title: 'Colour theme',
    onClick: () => openMenu(themeButton, THEMES.map((theme) => ({
      label: theme.name,
      onSelect: () => actions.setTheme(theme.id),
    }))),
  }, icon('moon', { size: 15 }));
  const settingsButton = h('button', {
    class: 'icon-button',
    title: 'Settings',
    onClick: () => openMenu(settingsButton, [
      { label: 'Add a project folder', onSelect: () => actions.addProject() },
      { label: 'Stop all agents and close', onSelect: () => actions.stopAll() },
    ]),
  }, icon('settings', { size: 15 }));
  const footer = h('div', { class: 'account' },
    avatar,
    h('div', { class: 'account-text' }, accountName, accountMeta),
    h('div', { class: 'account-actions' }, themeButton, settingsButton));

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
    // own only folds the list of panels underneath it.
    const chevron = h('button', {
      class: 'icon-button chevron',
      title: open ? 'Hide its agents' : 'Show its agents',
      onClick: (event) => {
        event.stopPropagation();
        actions.toggleProject(project.path);
      },
    }, icon(open ? 'chevronDown' : 'chevronRight', { size: 14 }));

    const selected = sameFolder(project.path, model.selectedWorkspace ?? '');
    const row = h('div', {
      class: `project-row${selected ? ' selected' : ''}`,
      title: project.path,
      onClick: () => actions.selectWorkspace(project.path),
    },
      chevron,
      h('span', { class: 'label' }, project.name),
      h('span', { class: 'count' }, panels.length ? String(panels.length) : ''),
      h('span', { class: 'row-actions' }, addButton, moreButton));

    return h('div', { class: 'project' }, row, open ? panels.map((panel) => agentRow(panel, model)) : []);
  }

  const header = h('div', { class: 'sidebar-header' },
    h('span', { class: 'title' }, 'Workspaces'),
    h('button', { class: 'icon-button', title: 'Add a project folder', onClick: () => actions.addProject() }, icon('plus')));
  root.replaceChildren(header, scroll, footer);

  return {
    render(model) {
      const { state } = model;
      if (!state) return;

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

      const running = state.panels.filter(isActive).length;
      const name = state.user?.name || 'Local';
      avatar.textContent = name.slice(0, 1).toUpperCase();
      accountName.textContent = name;
      accountMeta.textContent = `${running} running · ${plural(state.projects.length, 'folder')}`;
    },
  };
}
