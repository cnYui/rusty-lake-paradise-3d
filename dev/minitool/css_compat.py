r"""小红书小工具的 CSS 兼容：扫描 + 转写。基线是 Android 8.1 出厂 Chrome / WebView 61（官方文档 §2.2）。

用法：
  python dev/minitool/css_compat.py <css 文件> [...]       只扫描，有 [布局] 问题退出码 1
  build.py 里 import 本文件：transform(css) 先转写，再 scan(css) 当闸门

Chrome 61 不认的写法（扫描）：
  [布局] 会让布局塌掉：inset（87）、min() / max() / clamp()（79）、aspect-ratio（88）、:is() / :where() / :has()（88 / 88 / 105）、
         @container / @layer / @property、独立的 translate / rotate / scale 属性（104）、嵌套（&）、flex 容器里的 gap（84，没有兜底时）
  [外观] 只是样子不对：accent-color（93）、grid 里的 gap（66，要写 grid-gap）、dvh / svh / lvh、:focus-visible、backdrop-filter、color-mix()
转写（等价写法，现代浏览器里效果不变）：
  - inset: a b c d  →  top / right / bottom / left 四个属性
  - grid 里的 gap  →  同时写 grid-gap（Chrome 57 起支持的老名字，现代浏览器也认）
  - flex 容器里的 gap  →  生成 "html.no-flexgap 选择器 > * + *" 的 margin 兜底规则，只在 compat.js 判定“不支持 flex gap”时生效
"""
import re, sys

# ---------------------------------------------------------------------------------------------- 解析
def blank_comments(css):
    """把注释换成等长空白（保留换行），行号不变。"""
    return re.sub(r'/\*.*?\*/', lambda m: re.sub(r'[^\n]', ' ', m.group(0)), css, flags=re.S)


def split_decls(body):
    """按分号切声明，括号里的分号（url(data:...;base64,...)）不算。返回 [(prop, value, 起点, 终点)]，起点 / 终点是在 body 里的偏移（终点指向分号）。"""
    out, depth, start = [], 0, 0
    for i, ch in enumerate(body + ';'):
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        elif ch == ';' and depth == 0:
            seg = (body + ';')[start:i]
            if ':' in seg:
                k, v = seg.split(':', 1)
                out.append((k.strip().lower(), v.strip(), start, i))
            start = i + 1
    return out


def parse_rules(css):
    """返回 [{sel, body, body_start, line, ctx}]。ctx 是外层 @ 规则的前导文字（@media / @supports ...）。@keyframes 里面的不算规则。"""
    flat = blank_comments(css)
    rules, stack, start = [], [], 0
    for i, ch in enumerate(flat):
        if ch == '{':
            prelude = flat[start:i].strip()
            stack.append({'prelude': prelude, 'body_start': i + 1, 'start': start})
            start = i + 1
        elif ch == '}':
            if not stack:
                start = i + 1
                continue
            top = stack.pop()
            if not top['prelude'].startswith('@') and not any(s['prelude'].startswith('@keyframes') or s['prelude'].startswith('@-webkit-keyframes') for s in stack):
                ctx = [s['prelude'] for s in stack if s['prelude'].startswith('@')]
                line = flat.count('\n', 0, top['start'] + (len(flat[top['start']:i]) - len(flat[top['start']:i].lstrip()))) + 1
                rules.append({'sel': top['prelude'], 'body': flat[top['body_start']:i], 'body_start': top['body_start'], 'line': line, 'ctx': ctx})
            start = i + 1
        elif ch == ';' and not stack:
            start = i + 1     # @import / @charset
    return rules


def decl_map(rule):
    return {d[0]: d[1] for d in split_decls(rule['body'])}


def merged(rules, sel):
    """同一个选择器（整串相同）在所有规则里的声明合并起来（后面的覆盖前面的）。#boot 的 display:flex 和 gap 就写在两个文件的两条规则里。"""
    out = {}
    for r in rules:
        if r['sel'] == sel:
            out.update(decl_map(r))
    return out


def flex_selectors(rules):
    return {r['sel'] for r in rules if decl_map(r).get('display', '') in ('flex', 'inline-flex')}


def grid_selectors(rules):
    return {r['sel'] for r in rules if decl_map(r).get('display', '') in ('grid', 'inline-grid')}


# ---------------------------------------------------------------------------------------------- 转写
def expand_inset(value):
    imp = ''
    if re.search(r'!\s*important\s*$', value):
        imp = ' !important'
        value = re.sub(r'\s*!\s*important\s*$', '', value)
    v = value.split()
    assert 1 <= len(v) <= 4, f'看不懂的 inset：{value}'
    t = v[0]; r = v[1] if len(v) > 1 else t; b = v[2] if len(v) > 2 else t; l = v[3] if len(v) > 3 else r
    return f'top: {t}{imp}; right: {r}{imp}; bottom: {b}{imp}; left: {l}{imp}'


def transform(css):
    """返回 (新 css, 说明列表)。"""
    notes = []

    # 1. inset → top/right/bottom/left（只改真正的声明：用去掉注释的副本找位置，在原文上替换）
    flat = blank_comments(css)
    out, pos, n = [], 0, 0
    for m in re.finditer(r'(?<![\w-])inset\s*:\s*([^;{}]+?)\s*(?=[;}])', flat):
        out.append(css[pos:m.start()])
        out.append(expand_inset(m.group(1)))
        pos = m.end()
        n += 1
    out.append(css[pos:])
    css = ''.join(out)
    if n:
        notes.append(f'inset → top/right/bottom/left：{n} 处')

    # 2. grid 里的 gap → 加 grid-gap；flex 里的 gap → 兜底规则
    fallback = []
    edits = []     # (在 css 里的位置, 要插入的文字)
    all_rules = parse_rules(css)
    flex_sels, grid_sels = flex_selectors(all_rules), grid_selectors(all_rules)
    for r in all_rules:
        decls = split_decls(r['body'])
        gaps = [d for d in decls if d[0] in ('gap', 'row-gap', 'column-gap')]
        if not gaps:
            continue
        dm = merged(all_rules, r['sel'])
        if r['sel'] in grid_sels:
            for k, v, a, b in gaps:
                if k == 'gap' and 'grid-gap' not in dm:
                    edits.append((r['body_start'] + b + 1, f' grid-gap: {v};'))
                    notes.append(f'grid gap → 同时写 grid-gap：{r["sel"]}  {v}')
        elif r['sel'] in flex_sels:
            col = dm.get('flex-direction', 'row').startswith('column')
            gv = {d[0]: d[1] for d in gaps}
            if 'gap' in gv:
                parts = gv['gap'].split()
                row_gap, col_gap = parts[0], (parts[1] if len(parts) > 1 else parts[0])
            else:
                row_gap, col_gap = gv.get('row-gap', '0'), gv.get('column-gap', '0')
            val = row_gap if col else col_gap
            prop = 'margin-top' if col else 'margin-left'
            for sel in [x.strip() for x in r['sel'].split(',')]:
                fallback.append(f'html.no-flexgap {sel} > * + * {{ {prop}: {val}; }}')
            notes.append(f'flex gap → margin 兜底（{"纵向" if col else "横向"}）：{r["sel"]}  gap {val}')
            if 'flex-wrap' in dm and dm['flex-wrap'] != 'nowrap':
                notes.append(f'⚠ {r["sel"]} 是 flex-wrap 容器，margin 兜底在换行处不精确')
    for pos, text in sorted(edits, reverse=True):
        css = css[:pos] + text + css[pos:]
    if fallback:
        css += ('\n/* [小红书小工具] Chrome 84 以前 flex 容器不支持 gap：compat.js 检测到时给 <html> 加 no-flexgap，用 margin 补上 */\n'
                + '\n'.join(fallback) + '\n')
    return css, notes


# ---------------------------------------------------------------------------------------------- 扫描
def scan(css, name='style.css'):
    """返回 [(级别, 行号, 说明)]，级别 '布局' / '外观'。"""
    flat = blank_comments(css)
    found = []
    rules = parse_rules(css)
    flex_sels, grid_sels = flex_selectors(rules), grid_selectors(rules)

    def line_of(pos):
        return flat.count('\n', 0, pos) + 1

    covered = set()
    for r in rules:
        if 'no-flexgap' in r['sel']:
            covered.add(r['sel'].replace('html.no-flexgap', '').strip())
    for r in rules:
        sel = r['sel']
        for pat, why, lvl in [
            (r':is\(', ':is()（Chrome 88）', '布局'), (r':where\(', ':where()（Chrome 88）', '布局'), (r':has\(', ':has()（Chrome 105）', '布局'),
            (r':focus-visible', ':focus-visible（Chrome 86）', '外观'), (r'&', 'CSS 嵌套 &（Chrome 120）', '布局'),
        ]:
            if re.search(pat, sel):
                found.append((lvl, r['line'], f'{why}：{sel}'))
        supports = any('@supports' in c for c in r['ctx'])
        dm = merged(rules, sel)
        for k, v, a, b in split_decls(r['body']):
            seg = r['body'][a:b]
            ln = line_of(r['body_start'] + a + (len(seg) - len(seg.lstrip())))
            if k == 'inset' or k.startswith('inset-'):
                found.append(('布局', ln, f'{k}（Chrome 87）：{sel}'))
            if re.search(r'(?<![\w-])(min|max|clamp)\(', v):
                found.append(('布局', ln, f'CSS 函数 min() / max() / clamp()（Chrome 79）：{sel} {{ {k}: {v} }}'))
            if k == 'aspect-ratio':
                found.append(('布局', ln, f'aspect-ratio（Chrome 88）：{sel}'))
            if k in ('translate', 'rotate', 'scale'):
                found.append(('布局', ln, f'独立的 {k} 属性（Chrome 104）：{sel}'))
            if k == 'accent-color':
                found.append(('外观', ln, f'accent-color（Chrome 93）：{sel}'))
            if k == 'backdrop-filter':
                found.append(('外观', ln, f'backdrop-filter（Chrome 76）：{sel}'))
            if re.search(r'\b\d*\.?\d+(dvh|svh|lvh|dvw|svw|lvw)\b', v) and not supports:
                found.append(('外观', ln, f'dvh / svh / lvh（Chrome 108）没有 @supports 保护：{sel}'))
            if re.search(r'color-mix\(|oklch\(|oklab\(|\blab\(|\blch\(', v):
                found.append(('外观', ln, f'新颜色函数（Chrome 111+）：{sel}'))
            if k in ('gap', 'row-gap', 'column-gap'):
                if sel in flex_sels:
                    ok = all(s.strip() in covered for s in sel.split(','))
                    # 兜底规则选择器形如 "<sel> > * + *"
                    ok = ok or all((s.strip() + ' > * + *') in covered for s in sel.split(','))
                    if not ok:
                        found.append(('布局', ln, f'flex 容器里的 {k}（Chrome 84）没有 no-flexgap 兜底：{sel}'))
                elif sel in grid_sels and k == 'gap' and 'grid-gap' not in dm:
                    found.append(('外观', ln, f'grid 里的 gap（Chrome 66）没写 grid-gap：{sel}'))
    for m in re.finditer(r'@(container|layer|property|scope|starting-style)\b', flat):
        found.append(('布局', line_of(m.start()), f'@{m.group(1)}（新规则，Chrome 61 整段忽略）'))
    return found


def main(paths):
    bad = 0
    for p in paths:
        css = open(p, encoding='utf-8').read()
        found = scan(css, p)
        for lvl, ln, why in found:
            print(f'[{lvl}] {p}:{ln}  {why}')
        bad += sum(1 for f in found if f[0] == '布局')
        print(f'{p}：[布局]问题 {sum(1 for f in found if f[0] == "布局")} 处，[外观]提示 {sum(1 for f in found if f[0] == "外观")} 处')
    return 1 if bad else 0


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1:]))
