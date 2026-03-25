/// <mls fileReference="_102033_/l2/shared/bootstrap.ts" enhancement="_blank" />
import '/_102033_/l2/shared/shell.js';

function ensureShellRoot() {
  const existing = document.querySelector('collab-aura-shell');
  if (existing) {
    return existing;
  }

  const shell = document.createElement('collab-aura-shell');
  document.body.appendChild(shell);
  return shell;
}

ensureShellRoot();
