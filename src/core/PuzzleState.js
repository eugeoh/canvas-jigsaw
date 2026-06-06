const STATE_VERSION = 1;

export function exportPuzzleState(pieces, metadata = {}) {
    return {
        version: STATE_VERSION,
        metadata,
        pieces: pieces.map((piece) => piece.toJSON())
    };
}

export function importPuzzleState(pieces, state) {
    if (!state || state.version !== STATE_VERSION || !Array.isArray(state.pieces)) {
        throw new Error('Unsupported or invalid puzzle state');
    }

    const savedById = new Map(state.pieces.map((piece) => [piece.id, piece]));
    const groups = new Map();

    for (const piece of pieces) {
        const saved = savedById.get(piece.id);
        if (!saved) continue;

        piece.currentX = saved.currentX;
        piece.currentY = saved.currentY;
        piece.isPlaced = Boolean(saved.isPlaced);
        piece.groupId = saved.groupId ?? null;
        piece.zIndex = saved.zIndex ?? 0;
        piece.groupMembers = [piece];

        if (piece.groupId !== null) {
            if (!groups.has(piece.groupId)) groups.set(piece.groupId, []);
            groups.get(piece.groupId).push(piece);
        }
    }

    for (const members of groups.values()) {
        for (const piece of members) {
            piece.groupMembers = members;
        }
    }

    return state.metadata || {};
}
