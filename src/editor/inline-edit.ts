/**
 * Replace an element with an inline input. Handles Enter to commit,
 * Escape to cancel, and blur to commit. Calls onDone() after either path.
 */
export function startInlineEdit(
  target: HTMLElement,
  input: HTMLInputElement,
  onCommit: (input: HTMLInputElement) => void,
  onDone: () => void,
): void {
  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    onCommit(input);
    onDone();
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      committed = true;
      onDone();
    }
  });
  input.addEventListener('blur', commit);

  target.replaceWith(input);
  input.focus();
  input.select();
}
