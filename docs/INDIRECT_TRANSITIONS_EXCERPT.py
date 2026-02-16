"""
Indirect Transition Support for Wang Tile Autotiling
=====================================================

Drop-in module for autotile engines that need to handle indirect transitions:
  - Grass(1) <-> Dirt(2) tiles exist
  - Grass(1) <-> Sand(3) tiles exist
  - Dirt(2) <-> Sand(3) tiles do NOT exist
  - Painting Sand next to Dirt should auto-insert a Grass border

APPROACH: Smart Paint Brush
  The standard autotile matcher can only handle direct (distance-1) transitions.
  When two colors have distance > 1, the PAINT BRUSH must insert intermediate
  color rings before invoking the matcher. This way the matcher only ever sees
  adjacent cells with distance <= 1, and always finds valid transition tiles.

USAGE:
    # Replace your existing paint call with:
    smart_paint(map, wang_set, {(x, y)}, color)

REQUIREMENTS:
    Your existing code must provide these interfaces (adapt method names
    to match your codebase):

    wang_set.all_wang_ids_and_cells()  -> iterable of (WangId, Cell)
    wang_set.wang_id_of(cell)          -> WangId or None
    wang_set.color_distance(a, b)      -> int (-1 if no path)
    wang_set.maximum_color_distance    -> int (precomputed max of distance matrix)
    wang_set.color_count               -> int (number of colors, 1-based)
    wang_set.wang_id_probability(wid)  -> float
    wang_set.type                      -> str ("corner", "edge", or "mixed")

    map.cell_at(x, y)                 -> Cell (or None/empty)
    map.set_cell(x, y, cell)          -> void
    map.width, map.height             -> int

    WangId (see minimal implementation at bottom of this file)
"""

import random


# ---------------------------------------------------------------------------
# Neighbor lookup
# ---------------------------------------------------------------------------

NEIGHBOR_OFFSETS = [
    ( 0, -1),  # 0: Top
    ( 1, -1),  # 1: TopRight
    ( 1,  0),  # 2: Right
    ( 1,  1),  # 3: BottomRight
    ( 0,  1),  # 4: Bottom
    (-1,  1),  # 5: BottomLeft
    (-1,  0),  # 6: Left
    (-1, -1),  # 7: TopLeft
]


def neighbor_at(pos, index):
    dx, dy = NEIGHBOR_OFFSETS[index]
    return (pos[0] + dx, pos[1] + dy)


# ---------------------------------------------------------------------------
# Smart Paint Brush — the main entry point
# ---------------------------------------------------------------------------

def smart_paint(map, wang_set, positions, color):
    """
    Paint terrain with automatic intermediate color insertion.

    When the painted color can't directly transition to a neighbor's color
    (color distance > 1), this inserts rings of intermediate colors to bridge
    the gap. Then the standard autotile matcher fills in the correct
    transition tiles.

    Args:
        map:        Your tile map object
        wang_set:   The WangSet to use
        positions:  set of (x, y) tuples to paint
        color:      int — the WangColor index to paint (1-based)

    Example: painting Sand(3) into a field of Dirt(2):
        dist(Sand, Dirt) = 2, path = Sand -> Grass -> Dirt

        Result:
        ... [Dirt] [Dirt-Grass] [Grass-Sand] [Sand] [Sand-Grass] [Grass-Dirt] [Dirt] ...
                   transition   transition   painted  transition   transition

        2 transition tiles per direction. No solid Grass tile — Grass only
        appears as the shared color inside transition tiles.
        Total footprint for 1 painted tile = 5x5.
    """
    positions = set(positions)

    # Step 1: Build the paint color map (user's positions + intermediates)
    paint_colors = {pos: color for pos in positions}

    intermediate_rings = _compute_intermediate_rings(
        map, wang_set, positions, color
    )
    for pos, ring_color in intermediate_rings.items():
        if pos not in paint_colors:
            paint_colors[pos] = ring_color

    # Step 2: Compute the full affected region (painted + intermediates + 1-tile border)
    all_affected = set(paint_colors.keys())
    for pos in list(all_affected):
        for dx in [-1, 0, 1]:
            for dy in [-1, 0, 1]:
                all_affected.add((pos[0] + dx, pos[1] + dy))

    # Step 3: Resolve each cell using the standard matcher.
    #   Every adjacent pair now has color distance <= 1, so the matcher
    #   will always find valid transition tiles.
    _resolve_region(map, wang_set, all_affected, paint_colors)


# ---------------------------------------------------------------------------
# Intermediate ring computation
# ---------------------------------------------------------------------------

def _compute_intermediate_rings(map, wang_set, positions, color):
    """
    BFS outward from the paint region. For each border cell whose existing
    color has distance > 1 from the painted color, insert the next
    intermediate color on the shortest path.

    Returns: dict of {(x, y): intermediate_color_index}
    """
    intermediates = {}
    visited = set(positions)

    # Seed: cells adjacent to the paint region
    current_frontier = set()
    for pos in positions:
        for dx in [-1, 0, 1]:
            for dy in [-1, 0, 1]:
                nb = (pos[0] + dx, pos[1] + dy)
                if nb not in visited:
                    current_frontier.add(nb)

    from_color = color

    while current_frontier:
        next_frontier = set()

        for pos in current_frontier:
            if pos in visited:
                continue
            visited.add(pos)

            # What color is currently at this cell?
            existing_color = _get_dominant_color(map, wang_set, pos)
            if existing_color == 0 or existing_color == from_color:
                continue

            distance = wang_set.color_distance(from_color, existing_color)
            if distance < 0:
                continue  # No path at all
            if distance <= 1:
                continue  # Direct transition exists

            # Need an intermediate. Find the next hop on the shortest path.
            intermediate = _next_color_on_path(
                wang_set, from_color, existing_color
            )
            if intermediate is None:
                continue

            intermediates[pos] = intermediate

            # Expand frontier for potential further rings
            for dx in [-1, 0, 1]:
                for dy in [-1, 0, 1]:
                    nb = (pos[0] + dx, pos[1] + dy)
                    if nb not in visited:
                        next_frontier.add(nb)

        current_frontier = next_frontier

        # If we placed intermediates, the next ring transitions FROM the
        # intermediate color (not the original painted color)
        if intermediates:
            # Use the intermediate color as the new "from" for the next ring
            from_color = next(iter(intermediates.values()))

    return intermediates


def _next_color_on_path(wang_set, from_color, to_color):
    """
    Find the next color on the shortest path from from_color to to_color.

    Example: from=Sand(3), to=Dirt(2) -> returns Grass(1)
    (because Sand->Grass is distance 1, Grass->Dirt is distance 1)
    """
    if wang_set.color_distance(from_color, to_color) <= 1:
        return None

    best_next = None
    best_remaining = float('inf')

    for c in range(1, wang_set.color_count + 1):
        if c == from_color:
            continue
        dist_from = wang_set.color_distance(from_color, c)
        dist_to = wang_set.color_distance(c, to_color)
        if dist_from == 1 and 0 <= dist_to < best_remaining:
            best_next = c
            best_remaining = dist_to

    return best_next


def _get_dominant_color(map, wang_set, pos):
    """Get the most common non-zero color in the tile at pos."""
    cell = map.cell_at(pos[0], pos[1])
    if cell is None:
        return 0
    wang_id = wang_set.wang_id_of(cell)
    if wang_id is None:
        return 0
    counts = {}
    for i in range(8):
        c = wang_id.index_color(i)
        if c > 0:
            counts[c] = counts.get(c, 0) + 1
    return max(counts, key=counts.get) if counts else 0


# ---------------------------------------------------------------------------
# Standard tile matcher (resolve a region)
# ---------------------------------------------------------------------------

def _resolve_region(map, wang_set, all_positions, paint_colors):
    """
    Resolve tiles for all positions in the region.
    paint_colors maps positions to their desired terrain color.
    Positions not in paint_colors are resolved from their neighbors.
    """
    # Sort: painted cells first, then by distance from center (inside-out)
    if paint_colors:
        cx = sum(p[0] for p in paint_colors) / len(paint_colors)
        cy = sum(p[1] for p in paint_colors) / len(paint_colors)
    else:
        cx, cy = 0, 0

    def sort_key(pos):
        in_paint = 0 if pos in paint_colors else 1
        dist = abs(pos[0] - cx) + abs(pos[1] - cy)
        return (in_paint, dist)

    ordered = sorted(all_positions, key=sort_key)

    for pos in ordered:
        desired = _wang_id_from_surroundings(map, wang_set, pos)

        # If this position has an explicit paint color, override
        if pos in paint_colors:
            desired = _apply_paint_color(desired, paint_colors[pos], wang_set)

        mask = desired.mask()
        cell = find_best_match(wang_set, desired, mask)

        if cell is not None:
            map.set_cell(pos[0], pos[1], cell)


# ---------------------------------------------------------------------------
# find_best_match
# ---------------------------------------------------------------------------

def find_best_match(wang_set, desired, mask):
    """
    Search all tiles (including transformed variants) for the best match
    to the desired WangId under the given mask.
    """
    best_penalty = float('inf')
    best_candidates = []

    for wang_id, cell in wang_set.all_wang_ids_and_cells():
        # Hard constraint: masked indices must match exactly
        if (wang_id.value & mask.value) != (desired.value & mask.value):
            continue

        # Soft constraint: unmasked indices, prefer closer colors
        total_penalty = 0
        valid = True

        for i in range(8):
            d = desired.index_color(i)
            c = wang_id.index_color(i)
            if d == 0 or d == c:
                continue
            penalty = wang_set.color_distance(d, c)
            if penalty < 0:
                valid = False
                break
            total_penalty += penalty

        if not valid:
            continue

        if total_penalty < best_penalty:
            best_penalty = total_penalty
            best_candidates = []

        if total_penalty == best_penalty:
            weight = wang_set.wang_id_probability(wang_id)
            best_candidates.append((cell, weight))

    if not best_candidates:
        return None

    # Weighted random among equal-penalty candidates
    total = sum(w for _, w in best_candidates)
    r = random.uniform(0, total)
    cumulative = 0.0
    for value, weight in best_candidates:
        cumulative += weight
        if r <= cumulative:
            return value
    return best_candidates[-1][0]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _wang_id_from_surroundings(map, wang_set, pos):
    """Build desired WangId from placed neighbors."""
    desired = WangId(0)
    for i in range(8):
        nb = neighbor_at(pos, i)
        cell = map.cell_at(nb[0], nb[1])
        if cell is None:
            continue
        wang_id = wang_set.wang_id_of(cell)
        if wang_id is None:
            continue
        opposite = (i + 4) % 8
        desired.set_index_color(i, wang_id.index_color(opposite))
    return desired


def _apply_paint_color(desired, color, wang_set):
    """Override desired WangId with the paint color on active indices."""
    result = WangId(desired.value)
    if wang_set.type == 'corner':
        indices = [1, 3, 5, 7]
    elif wang_set.type == 'edge':
        indices = [0, 2, 4, 6]
    else:
        indices = list(range(8))
    for i in indices:
        result.set_index_color(i, color)
    return result


# ---------------------------------------------------------------------------
# Minimal WangId (replace with your own if you already have one)
# ---------------------------------------------------------------------------

class WangId:
    BITS = 8
    MASK = 0xFF

    def __init__(self, value=0):
        self.value = int(value)

    def index_color(self, index):
        return (self.value >> (index * self.BITS)) & self.MASK

    def set_index_color(self, index, color):
        shift = index * self.BITS
        self.value = (self.value & ~(self.MASK << shift)) | ((color & self.MASK) << shift)

    def mask(self):
        m = WangId(0)
        for i in range(8):
            if self.index_color(i) != 0:
                m.set_index_color(i, 0xFF)
        return m

    def __repr__(self):
        return f"WangId({[self.index_color(i) for i in range(8)]})"
