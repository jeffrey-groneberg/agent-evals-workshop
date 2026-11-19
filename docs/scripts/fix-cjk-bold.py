#!/usr/bin/env python3
r"""Fixes **bold** pairs that Markdown can't close in Chinese text, so they don't show literal asterisks.

CommonMark only closes `**` when the character before it isn't punctuation, or when whitespace or punctuation
follows. In Chinese, `**原因明确。**如果` breaks that rule: `。` is punctuation and `如` follows directly. This
script moves full-width punctuation and paired quotes outside the bold (`**原因明确**。如果`), or adds the
space that the spacing rules ask for between inline code and Chinese (`**\`vally\`** 的结果`).
It leaves fenced code blocks and inline code alone, and reports what it can't fix.

Usage: fix-cjk-bold.py [--check] <file.mdx> [...]   (--check reports without changing files)
"""
import re
import sys
import unicodedata

SENTENCE = "，。：；！？、…"
PAIRS = {"“": "”", "‘": "’", "（": "）", "「": "」", "『": "』", "《": "》", "【": "】"}
OPENERS = "“‘（「『《【"


def is_ws(c):
    return c == "" or c.isspace()


def is_punct(c):
    return c != "" and unicodedata.category(c)[0] in "PS"


def left_flanking(prev, nxt):
    return not is_ws(nxt) and (not is_punct(nxt) or is_ws(prev) or is_punct(prev))


def right_flanking(prev, nxt):
    return not is_ws(prev) and (not is_punct(prev) or is_ws(nxt) or is_punct(nxt))


def fix_pair(prev, inner, nxt):
    """Returns (pre, inner, post, ok) so that prev + pre + ** + inner + ** + post + nxt renders as bold."""
    pre, post = "", ""
    for _ in range(6):
        p = pre[-1] if pre else prev
        n = post[0] if post else nxt
        if not inner:
            return pre, inner, post, False
        if not right_flanking(inner[-1], n):
            if inner[-1] in SENTENCE:
                post, inner = inner[-1] + post, inner[:-1]
            elif len(inner) > 2 and PAIRS.get(inner[0]) == inner[-1]:
                pre, post, inner = pre + inner[0], inner[-1] + post, inner[1:-1]
            elif not is_ws(n) and not is_punct(n):
                post = " " + post
            else:
                return pre, inner, post, False
            continue
        if not left_flanking(p, inner[0]):
            if len(inner) > 2 and PAIRS.get(inner[0]) == inner[-1]:
                pre, post, inner = pre + inner[0], inner[-1] + post, inner[1:-1]
            elif inner[0] in OPENERS:
                pre, inner = pre + inner[0], inner[1:]
            elif not is_ws(p) and not is_punct(p):
                pre = pre + " "
            else:
                return pre, inner, post, False
            continue
        return pre, inner, post, True
    return pre, inner, post, False


def fix_line(line):
    # Inline code is masked so that `**` inside it is never touched; the real characters still decide flanking.
    masked = re.sub(r"`[^`]*`", lambda m: "\0" * len(m.group(0)), line)
    pieces, last, changes, problems = [], 0, 0, []
    for m in re.finditer(r"\*\*((?:(?!\*\*).)+?)\*\*", masked):
        start, end = m.start(), m.end()
        inner = line[start + 2 : end - 2]
        prev = line[start - 1] if start > 0 else ""
        nxt = line[end] if end < len(line) else ""
        if left_flanking(prev, inner[0]) and right_flanking(inner[-1], nxt):
            continue
        pre, new_inner, post, ok = fix_pair(prev, inner, nxt)
        if not ok:
            problems.append(line[max(0, start - 6) : end + 6])
            continue
        pieces.append(line[last:start] + pre + "**" + new_inner + "**" + post)
        last, changes = end, changes + 1
    pieces.append(line[last:])
    return "".join(pieces), changes, problems


def fix_file(path, write=True):
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    fence, total, problems = None, 0, []
    for i, line in enumerate(lines):
        stripped = line.lstrip()
        marker = re.match(r"(`{3,}|~{3,})", stripped)
        if marker:
            if fence is None:
                fence = marker.group(1)[0] * len(marker.group(1))
            elif stripped.startswith(fence):
                fence = None
            continue
        if fence is not None or "**" not in line:
            continue
        new, changes, line_problems = fix_line(line)
        lines[i], total = new, total + changes
        problems += [f"{path}:{i + 1}: {p}" for p in line_problems]
    if total and write:
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
    return total, problems


if __name__ == "__main__":
    check = "--check" in sys.argv
    grand = 0
    for path in [a for a in sys.argv[1:] if a != "--check"]:
        changes, problems = fix_file(path, write=not check)
        grand += changes
        print(f"{changes:3} {'to fix' if check else 'fixed'}  {path}")
        for p in problems:
            print(f"    can't fix: {p}")
    print(f"{grand} bold pairs {'to fix' if check else 'fixed'}")
    sys.exit(1 if check and grand else 0)
