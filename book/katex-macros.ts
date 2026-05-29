/**
 * Custom KaTeX macros available in all math contexts:
 * inline math, display math, numbered equations, and tooltips.
 *
 * Syntax: '\\commandName': 'expansion'
 * Use #1, #2, … for arguments.
 *
 * Examples:
 *   '\\RR': '\\mathbb{R}'
 *   '\\norm': '\\left\\lVert #1 \\right\\rVert'
 */
export const katexMacros: Record<string, string> = {
    '\\st': '\\text{s.t.}',
    '\\R': '\\mathbb{R}',
    '\\Z': '\\mathbb{Z}',
    '\\T': '^\\intercal',
    '\\inv': '^{-1}',
    '\\mat': '\\mathbf{#1}',
    '\\A': '\\mat{A}',
    '\\B': '\\mat{B}',
    '\\b': '\\mat{b}',
    '\\c': '\\mat{c}',
    '\\x': '\\mat{x}',
    '\\y': '\\mat{y}',
    '\\zeros': '\\mat{0}',
    '\\ones': '\\mat{1}',
    '\\identity': '\\mat{I}',
    '\\P': '\\mathcal{P}',
    '\\NP': '\\mathcal{NP}',
    '\\coNP': '\\text{co-}\\mathcal{NP}',
    '\\floor': '\\lfloor #1 \\rfloor',
    '\\ceil': '\\lceil #1 \\rceil',
    '\\conv': '\\operatorname{conv}',
    '\\cone': '\\operatorname{cone}',
    '\\bpi': '\\mathbb{\\pi}',
    '\\Q': '\\mathbf{Q}',
    '\\indicator': '\\boldsymbol{1}',
    '\\prob': 'P\\left( #1 \\right)',
    '\\E': 'E\\left( #1 \\right)',
    '\\Var': '\\text{Var}!\\left( #1 \\right)',
    '\\O': 'O\\left( #1 \\right)'
};
