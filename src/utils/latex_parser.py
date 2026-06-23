import re

GREEK_SYMBOLS = {
    r"\alpha": "α",
    r"\beta": "β",
    r"\gamma": "γ",
    r"\delta": "δ",
    r"\epsilon": "ε",
    r"\zeta": "ζ",
    r"\eta": "η",
    r"\theta": "θ",
    r"\iota": "ι",
    r"\kappa": "κ",
    r"\lambda": "λ",
    r"\mu": "μ",
    r"\nu": "ν",
    r"\xi": "ξ",
    r"\omicron": "o",
    r"\pi": "π",
    r"\rho": "ρ",
    r"\sigma": "σ",
    r"\tau": "τ",
    r"\upsilon": "υ",
    r"\phi": "φ",
    r"\chi": "χ",
    r"\psi": "ψ",
    r"\omega": "ω",
    r"\Delta": "Δ",
    r"\Gamma": "Γ",
    r"\Theta": "Θ",
    r"\Lambda": "Λ",
    r"\Xi": "Ξ",
    r"\Pi": "Π",
    r"\Sigma": "Σ",
    r"\Phi": "Φ",
    r"\Psi": "Ψ",
    r"\Omega": "Ω",
    r"\infty": "∞",
    r"\partial": "∂",
    r"\nabla": "∇",
    r"\pm": "±",
    r"\times": "×",
    r"\div": "÷",
    r"\neq": "≠",
    r"\approx": "≈",
    r"\le": "≤",
    r"\ge": "≥",
    r"\sum": "∑",
    r"\prod": "∏",
    r"\int": "∫",
    r"\cdot": "·",
}


def parse_latex(s: str):
    idx = 0
    n = len(s)

    def peek():
        if idx < n:
            return s[idx]
        return None

    def next_char():
        nonlocal idx
        if idx < n:
            c = s[idx]
            idx += 1
            return c
        return None

    def parse_command():
        nonlocal idx
        next_char()  # consume '\'
        cmd = ""
        while idx < n and peek() and peek().isalpha():
            cmd += next_char()

        if cmd == "frac":
            num = parse_arg()
            den = parse_arg()
            return ("frac", num, den)
        else:
            symbol = "\\" + cmd
            unicode_val = GREEK_SYMBOLS.get(symbol, symbol)
            return ("text", unicode_val)

    def parse_arg():
        c = peek()
        if c == "{":
            next_char()
            return parse_group()
        elif c == "\\":
            return parse_command()
        elif c:
            return parse_char()
        return ("text", "")

    def parse_group():
        nodes = parse_sequence(is_group=True)
        if len(nodes) == 1:
            return nodes[0]
        return ("group", nodes)

    def parse_char():
        c = next_char()
        return ("text", c)

    def parse_sequence(is_group=False):
        nodes = []
        while idx < n:
            c = peek()
            if is_group and c == "}":
                next_char()
                break
            elif c == "{":
                next_char()
                nodes.append(parse_group())
            elif c == "\\":
                nodes.append(parse_command())
            elif c == "^":
                next_char()
                sup = parse_arg()
                if nodes:
                    base = nodes.pop()
                    nodes.append(("sup", base, sup))
                else:
                    nodes.append(("sup", ("text", ""), sup))
            elif c == "_":
                next_char()
                sub = parse_arg()
                if nodes:
                    base = nodes.pop()
                    nodes.append(("sub", base, sub))
                else:
                    nodes.append(("sub", ("text", ""), sub))
            else:
                nodes.append(parse_char())
        return nodes

    return parse_sequence()


def optimize_nodes(nodes):
    optimized = []
    current_text = ""
    for node in nodes:
        if node[0] == "text":
            current_text += node[1]
        else:
            if current_text:
                optimized.append(("text", current_text))
                current_text = ""
            if node[0] == "group":
                optimized.append(("group", optimize_nodes(node[1])))
            elif node[0] == "frac":
                optimized.append(("frac", optimize_node(node[1]), optimize_node(node[2])))
            elif node[0] == "sup":
                optimized.append(("sup", optimize_node(node[1]), optimize_node(node[2])))
            elif node[0] == "sub":
                optimized.append(("sub", optimize_node(node[1]), optimize_node(node[2])))
    if current_text:
        optimized.append(("text", current_text))
    return optimized


def optimize_node(node):
    if not node:
        return node
    if node[0] == "group":
        return ("group", optimize_nodes(node[1]))
    elif node[0] == "frac":
        return ("frac", optimize_node(node[1]), optimize_node(node[2]))
    elif node[0] == "sup":
        return ("sup", optimize_node(node[1]), optimize_node(node[2]))
    elif node[0] == "sub":
        return ("sub", optimize_node(node[1]), optimize_node(node[2]))
    return node


def render_node_to_omml(node) -> str:
    if not node:
        return ""
    ntype = node[0]
    if ntype == "text":
        val = node[1]
        val = val.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        return f"<m:r><m:t>{val}</m:t></m:r>"
    elif ntype == "group":
        return "".join(render_node_to_omml(c) for c in node[1])
    elif ntype == "frac":
        num_xml = render_node_to_omml(node[1])
        den_xml = render_node_to_omml(node[2])
        return f"<m:f><m:num>{num_xml}</m:num><m:den>{den_xml}</m:den></m:f>"
    elif ntype == "sup":
        base_xml = render_node_to_omml(node[1])
        sup_xml = render_node_to_omml(node[2])
        return f"<m:sSup><m:e>{base_xml}</m:e><m:sup>{sup_xml}</m:sup></m:sSup>"
    elif ntype == "sub":
        base_xml = render_node_to_omml(node[1])
        sub_xml = render_node_to_omml(node[2])
        return f"<m:sSub><m:e>{base_xml}</m:e><m:sub>{sub_xml}</m:sub></m:sSub>"
    return ""


def latex_to_omml(latex_str: str, is_block: bool = False) -> str:
    latex_str = latex_str.strip()
    if latex_str.startswith("$$") and latex_str.endswith("$$"):
        latex_str = latex_str[2:-2].strip()
    elif latex_str.startswith("$") and latex_str.endswith("$"):
        latex_str = latex_str[1:-1].strip()

    parsed_nodes = parse_latex(latex_str)
    optimized = optimize_nodes(parsed_nodes)
    inner_xml = "".join(render_node_to_omml(n) for n in optimized)

    ns = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"'
    if is_block:
        return f"<m:oMathPara {ns}><m:oMath>{inner_xml}</m:oMath></m:oMathPara>"
    else:
        return f"<m:oMath {ns}>{inner_xml}</m:oMath>"
