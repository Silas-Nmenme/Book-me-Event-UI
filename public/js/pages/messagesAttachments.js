// Attachment handling helpers for chat/message UIs.
// This module is intentionally small and UI-agnostic.

import { uploadMessageAttachments } from '../api.js';

export function getAttachmentInputs() {
  return {
    messageTextInput: document.getElementById('messageText'),
    attachmentsInput: document.getElementById('attachmentsInput'),
  };
}

/**
 * Uploads currently selected files from <input type="file" id="attachmentsInput">.
 * Returns an array of uploaded URLs.
 */
export async function uploadSelectedAttachments() {
  const { attachmentsInput } = getAttachmentInputs();
  if (!attachmentsInput?.files?.length) return [];

  const files = Array.from(attachmentsInput.files);
  const urls = await uploadMessageAttachments(files);
  return urls;
}

/**
 * Clears the attachment input after successful send.
 */
export function clearAttachmentsInput() {
  const { attachmentsInput } = getAttachmentInputs();
  if (!attachmentsInput) return;
  attachmentsInput.value = '';
}


