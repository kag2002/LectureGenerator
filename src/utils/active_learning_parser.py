import re


def parse_active_learning_into_notes(script: str) -> dict[int, str]:
    """
    Parses active learning script and maps slide numbers to their respective notes content.
    Returns a dictionary mapping slide_index (1-indexed) to notes string.
    """
    notes_map = {}
    if not script:
        return notes_map

    pattern = r"(### Hoạt động\s*\d+.*?Slide\s*:\s*\d+.*?(?:\n|$))"
    parts = re.split(pattern, script, flags=re.IGNORECASE)

    current_slide_idx = None
    for part in parts:
        if not part:
            continue
        header_match = re.search(r"Slide\s*:\s*(\d+)", part, re.IGNORECASE)
        if header_match:
            current_slide_idx = int(header_match.group(1))
            if current_slide_idx not in notes_map:
                notes_map[current_slide_idx] = part
            else:
                notes_map[current_slide_idx] += "\n\n" + part
        elif current_slide_idx is not None:
            notes_map[current_slide_idx] += part

    for k in notes_map:
        notes_map[k] = notes_map[k].strip()

    return notes_map
