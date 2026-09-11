// Inline SVG icons (stroke style, 24x24 grid) so the app needs no icon font.

const PATHS = {
  logo: '<path d="M12 2 21 7v10l-9 5-9-5V7z"/><path d="M12 22V12"/><path d="m21 7-9 5-9-5"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3"/><path d="M13 15h4"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  maximize: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/>',
  restore: '<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="m14 10 7-7"/><path d="m3 21 7-7"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  pin: '<path d="M12 17v5"/><path d="M9 10.76V6h6v4.76l2 3.24H7z"/><path d="M8 6h8"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
};

export function icon(name, { size = 16, className = 'icon' } = {}) {
  const span = document.createElement('span');
  span.className = className;
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
  return span;
}
