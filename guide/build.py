"""Build the SIS help centre with Python 3. No network or third-party dependencies."""
import html
import json
import re
import shutil
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
NAV = json.loads((ROOT / "navigation.json").read_text())
VERSION = json.loads((ROOT.parent / "frontend/package.json").read_text())["version"] if (ROOT.parent / "frontend/package.json").exists() else "1.0.0"


def inline(text):
    text = html.escape(text)
    text = re.sub(r"\[([^\]]+)\]\((\.\./[a-z-]+/)(#[a-z-]+)?\)", r'<a href="\2\3">\1</a>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", text)


def render(source):
    lines = source.splitlines()
    result, toc, used = [], [], set()
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith("```"):
            language = line[3:]
            block = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                block.append(lines[i]); i += 1
            if language == "flow":
                result.append('<ol class="flow" aria-label="Purchase workflow">' + ''.join('<li>' + inline(t) + '</li>' for t in block) + '</ol>')
            else:
                result.append('<pre><code>' + html.escape('\n'.join(block)) + '</code></pre>')
        elif line.startswith("#"):
            heading = re.match(r"^(#{1,3}) (.+)$", line)
            if not heading:
                raise ValueError(f"Unsupported heading {line}")
            level, title = len(heading[1]), heading[2]
            anchor = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
            if anchor in used:
                raise ValueError(f"Repeated heading {title}")
            used.add(anchor)
            result.append(f'<h{level} id="{anchor}">{inline(title)}</h{level}>')
            if level == 2:
                toc.append(f'<a href="#{anchor}">{html.escape(title)}</a>')
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip('|').split('|')]
                if not all(re.fullmatch(r"[-: ]+", c) for c in cells):
                    tag = "th" if not rows else "td"
                    rows.append('<tr>' + ''.join(f'<{tag}>' + inline(c) + f'</{tag}>' for c in cells) + '</tr>')
                i += 1
            result.append('<div class="table-wrap" tabindex="0" role="region" aria-label="Reference table"><table><thead>' + rows[0] + '</thead><tbody>' + ''.join(rows[1:]) + '</tbody></table></div>')
            continue
        elif re.match(r"^(\d+\. |\- )", line):
            ordered = bool(re.match(r"^\d+\. ", line))
            pattern = r"^\d+\. " if ordered else r"^\- "
            tag, items = ('ol' if ordered else 'ul'), []
            while i < len(lines) and re.match(pattern, lines[i]):
                items.append('<li>' + inline(re.sub(pattern, '', lines[i])) + '</li>'); i += 1
            result.append(f'<{tag}>' + ''.join(items) + f'</{tag}>')
            continue
        else:
            paragraph = [line]
            i += 1
            while i < len(lines) and lines[i].strip() and not re.match(r"^(#|\||```|\d+\. |\- )", lines[i]):
                paragraph.append(lines[i]); i += 1
            result.append('<p>' + inline(' '.join(paragraph)) + '</p>')
            continue
        i += 1
    return '\n'.join(result), ''.join(toc)


def sidebar(selected):
    result, group = [], None
    for entry in NAV:
        if entry['group'] != group:
            group = entry['group']
            result.append('<p class="nav-group">' + html.escape(group) + '</p>')
        current = ' aria-current="page"' if entry['slug'] == selected else ''
        result.append(f'<a href="../{entry["slug"]}/"{current}>' + html.escape(entry['title']) + '</a>')
    return ''.join(result)


DIST.mkdir(exist_ok=True)
for entry in DIST.iterdir():
    if entry.is_dir() and not entry.is_symlink():
        shutil.rmtree(entry)
    else:
        entry.unlink()
shutil.copytree(ROOT / 'asset', DIST / 'asset')
# Reuse the existing SIS mark and body font; no third-party requests at runtime.


index = []
for position, page in enumerate(NAV):
    text = (ROOT / 'content' / (page['slug'] + '.md')).read_text()
    article, toc = render(text)
    index.append({**page, 'text': re.sub(r'[#*`|]', '', text)})
    previous = NAV[position - 1] if position else None
    following = NAV[position + 1] if position + 1 < len(NAV) else None
    pagination = ''.join(f'<a href="../{entry["slug"]}/"><small>{label}</small>{html.escape(entry["title"])}</a>' for label, entry in [('Previous', previous), ('Next', following)] if entry)
    output = f'''<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(page['title'])} | SIS Companion Help</title><meta name="description" content="{html.escape(page['description'], quote=True)}">
<meta name="robots" content="noindex,nofollow"><link rel="icon" href="../asset/logo.png"><link rel="stylesheet" href="../asset/style.css"><script src="../asset/app.js" defer></script></head>
<body><a class="skip" href="#main">Skip to content</a>
<header><a class="brand" href="../start/"><img src="../asset/logo.png" width="42" height="42" alt="SIS"><span>SIS Companion <small>Help centre</small></span></a><button id="menu" type="button" aria-expanded="false" aria-controls="sidebar">Menu</button><label class="search"><span>Search guides</span><input type="search" id="search" placeholder="Search guides…" autocomplete="off" aria-controls="search-result"><kbd>/</kbd></label></header>
<div id="search-result" class="search-result" hidden aria-live="polite"></div>
<div class="layout"><nav id="sidebar" aria-label="Documentation">{sidebar(page['slug'])}<div class="nav-footer">Guides for app v{html.escape(VERSION)}<br>User guide · source-reviewed</div></nav>
<main id="main"><div class="breadcrumb">Help centre / {html.escape(page['group'])}</div><article>{article}</article><nav class="pagination" aria-label="Guide pages">{pagination}</nav><footer>Reviewed 19 November 2026 · Deployment behaviour may differ.<br>For support, provide your app version and record reference. <button id="print" type="button">Print this guide</button></footer></main>
<aside aria-label="On this page"><p class="nav-group">On this page</p>{toc}</aside></div></body></html>'''
    folder = DIST / page['slug']; folder.mkdir()
    (folder / 'index.html').write_text(output)
# Root uses a standard, working link even when redirects are disabled.
(DIST / 'index.html').write_text('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./start/"><title>SIS Companion Help</title></head><body><a href="./start/">Open SIS Companion Help</a></body></html>')
(DIST / 'asset/search.json').write_text(json.dumps(index))
(DIST / 'robots.txt').write_text('User-agent: *\nDisallow: /\n')

class LinkCheck(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for key in ('href', 'src'):
            value = attrs.get(key, '')
            if not value or value.startswith(('#', 'http:', 'https:', 'data:')):
                continue
            target = (self.path.parent / value.split('#')[0]).resolve()
            assert target.is_relative_to(DIST.resolve()), value
            assert target.exists(), f'{self.path}: broken {value}'
        if tag == 'h1':
            self.headings += 1

for path in DIST.rglob('*.html'):
    check = LinkCheck(); check.path = path; check.headings = 0
    check.feed(path.read_text())
    if path.parent != DIST:
        assert check.headings == 1, path
print(f'Built and checked {len(NAV)} guides; all local navigation and asset links resolve.')
