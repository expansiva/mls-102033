/// <mls fileReference="_102033_/l2/shared/connectedRegionMove.ts" enhancement="_blank" />

const DOCUMENT_NODE = 9;

type MovableParent = ParentNode & {
  moveBefore?: (node: Node, child: Node | null) => void;
};

function sameDocument(destination: Node, node: Node): boolean {
  const destinationDocument = destination.nodeType === DOCUMENT_NODE ? destination : destination.ownerDocument;
  const nodeDocument = node.nodeType === DOCUMENT_NODE ? node : node.ownerDocument;
  return destinationDocument != null && destinationDocument === nodeDocument;
}

/**
 * Moves `node` into `destination` without wrapping it.
 *
 * Both sides connected, in the same document, and a destination that implements
 * `moveBefore`: one atomic move. Custom elements can then keep state through
 * `connectedMoveCallback`. Missing API, or a side that is not connected yet,
 * keeps `appendChild`. That fallback still runs the ordinary
 * disconnected/connected lifecycle. Preconditions are checked up front; a real
 * DOM error is not caught and not retried.
 */
export function moveConnectedRegion(destination: ParentNode, node: Node): void {
  if (node.parentNode === destination) return;

  const target = destination as MovableParent;
  const destinationNode = destination as unknown as Node;
  if (
    destinationNode.isConnected === true
    && node.isConnected === true
    && sameDocument(destinationNode, node)
    && typeof target.moveBefore === 'function'
  ) {
    target.moveBefore(node, null);
    return;
  }

  destination.appendChild(node);
}
