export function AvatarFallback({ initials = 'BME' } = {}) {
  return `<div class="rounded-circle border bme-avatar" aria-label="Profile picture">${initials}</div>`;
}

