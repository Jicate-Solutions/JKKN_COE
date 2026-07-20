// Catalog of educational math structures and symbols → LaTeX source.
// Feeds the equation-editor dialog (two labeled ribbons: Structures / Symbols,
// each a set of category tabs). Mirrors the MyJKKN reference coverage.
// `\square` marks a placeholder the author fills in. All tokens are KaTeX-valid.

export interface MathToken {
	label: string // rendered via KaTeX on the palette button
	latex: string // LaTeX inserted at the caret
	title?: string // tooltip
}

export interface MathCategory {
	name: string
	tokens: MathToken[]
}

const greek = (names: string[]): MathToken[] => names.map(g => ({ label: `\\${g}`, latex: `\\${g}` }))

// ── Structures ribbon ──
export const STRUCTURE_GROUPS: MathCategory[] = [
	{
		name: 'Fraction & Script',
		tokens: [
			{ label: '\\frac{a}{b}', latex: '\\frac{\\square}{\\square}', title: 'Fraction' },
			{ label: 'a/b', latex: '{\\square}/{\\square}', title: 'Linear fraction' },
			{ label: 'x^{n}', latex: '\\square^{\\square}', title: 'Superscript' },
			{ label: 'x_{n}', latex: '\\square_{\\square}', title: 'Subscript' },
			{ label: 'x_{a}^{b}', latex: '\\square_{\\square}^{\\square}', title: 'Sub + superscript' },
			{ label: '{}_{a}^{b}x', latex: '{}_{\\square}^{\\square}\\square', title: 'Pre-scripts' },
		],
	},
	{
		name: 'Radical',
		tokens: [
			{ label: '\\sqrt{x}', latex: '\\sqrt{\\square}', title: 'Square root' },
			{ label: '\\sqrt[n]{x}', latex: '\\sqrt[\\square]{\\square}', title: 'nth root' },
			{ label: '\\sqrt[3]{x}', latex: '\\sqrt[3]{\\square}', title: 'Cube root' },
		],
	},
	{
		name: 'Integral',
		tokens: [
			{ label: '\\int', latex: '\\int \\square \\, d\\square', title: 'Indefinite' },
			{ label: '\\int_{a}^{b}', latex: '\\int_{\\square}^{\\square} \\square \\, d\\square', title: 'Definite' },
			{ label: '\\iint', latex: '\\iint \\square \\, dA', title: 'Double' },
			{ label: '\\iiint', latex: '\\iiint \\square \\, dV', title: 'Triple' },
			{ label: '\\oint', latex: '\\oint \\square \\, d\\square', title: 'Contour' },
		],
	},
	{
		name: 'Large Operator',
		tokens: [
			{ label: '\\sum', latex: '\\sum_{\\square}^{\\square} \\square', title: 'Summation' },
			{ label: '\\prod', latex: '\\prod_{\\square}^{\\square} \\square', title: 'Product' },
			{ label: '\\coprod', latex: '\\coprod_{\\square}^{\\square}', title: 'Coproduct' },
			{ label: '\\bigcup', latex: '\\bigcup_{\\square}^{\\square}', title: 'Union' },
			{ label: '\\bigcap', latex: '\\bigcap_{\\square}^{\\square}', title: 'Intersection' },
			{ label: '\\lim', latex: '\\lim_{\\square \\to \\square}', title: 'Limit' },
		],
	},
	{
		name: 'Bracket',
		tokens: [
			{ label: '(\\;)', latex: '\\left( \\square \\right)', title: 'Parentheses' },
			{ label: '[\\;]', latex: '\\left[ \\square \\right]', title: 'Brackets' },
			{ label: '\\{\\;\\}', latex: '\\left\\{ \\square \\right\\}', title: 'Braces' },
			{ label: '|\\;|', latex: '\\left| \\square \\right|', title: 'Absolute value' },
			{ label: '\\|\\;\\|', latex: '\\left\\| \\square \\right\\|', title: 'Norm' },
			{ label: '\\binom{n}{k}', latex: '\\binom{\\square}{\\square}', title: 'Binomial' },
			{ label: '\\{cases', latex: '\\begin{cases} \\square & \\square \\\\ \\square & \\square \\end{cases}', title: 'Cases' },
		],
	},
	{
		name: 'Function',
		tokens: [
			{ label: '\\sin', latex: '\\sin' }, { label: '\\cos', latex: '\\cos' },
			{ label: '\\tan', latex: '\\tan' }, { label: '\\cot', latex: '\\cot' },
			{ label: '\\sec', latex: '\\sec' }, { label: '\\csc', latex: '\\csc' },
			{ label: '\\log', latex: '\\log' }, { label: '\\ln', latex: '\\ln' },
			{ label: '\\log_{a}', latex: '\\log_{\\square}' }, { label: '\\exp', latex: '\\exp' },
		],
	},
	{
		name: 'Accent',
		tokens: [
			{ label: '\\bar{x}', latex: '\\bar{\\square}', title: 'Bar / mean' },
			{ label: '\\vec{a}', latex: '\\vec{\\square}', title: 'Vector' },
			{ label: '\\hat{x}', latex: '\\hat{\\square}', title: 'Hat' },
			{ label: '\\dot{x}', latex: '\\dot{\\square}', title: 'Dot' },
			{ label: '\\tilde{x}', latex: '\\tilde{\\square}', title: 'Tilde' },
			{ label: '\\overline{x}', latex: '\\overline{\\square}', title: 'Overline' },
			{ label: '\\overrightarrow{x}', latex: '\\overrightarrow{\\square}', title: 'Over-arrow' },
		],
	},
	{
		name: 'Matrix',
		tokens: [
			{ label: '(\\;)', latex: '\\begin{pmatrix} \\square & \\square \\\\ \\square & \\square \\end{pmatrix}', title: '2×2 ()' },
			{ label: '[\\;]', latex: '\\begin{bmatrix} \\square & \\square \\\\ \\square & \\square \\end{bmatrix}', title: '2×2 []' },
			{ label: '|det|', latex: '\\begin{vmatrix} \\square & \\square \\\\ \\square & \\square \\end{vmatrix}', title: 'Determinant' },
			{ label: '3\\times3', latex: '\\begin{pmatrix} \\square & \\square & \\square \\\\ \\square & \\square & \\square \\\\ \\square & \\square & \\square \\end{pmatrix}', title: '3×3' },
		],
	},
]

// ── Symbols ribbon ──
export const SYMBOL_GROUPS: MathCategory[] = [
	{
		name: 'Basic Math',
		tokens: [
			{ label: '+', latex: '+' }, { label: '-', latex: '-' },
			{ label: '\\pm', latex: '\\pm' }, { label: '\\mp', latex: '\\mp' },
			{ label: '\\times', latex: '\\times' }, { label: '\\div', latex: '\\div' },
			{ label: '\\cdot', latex: '\\cdot' }, { label: '\\ast', latex: '\\ast' },
			{ label: '\\star', latex: '\\star' }, { label: '\\bmod', latex: '\\bmod', title: 'mod' },
			{ label: '\\%', latex: '\\%' }, { label: '\\infty', latex: '\\infty' },
			{ label: '!', latex: '!' }, { label: '\\propto', latex: '\\propto' },
		],
	},
	{
		name: 'Relations',
		tokens: [
			{ label: '=', latex: '=' }, { label: '\\neq', latex: '\\neq' },
			{ label: '\\approx', latex: '\\approx' }, { label: '\\equiv', latex: '\\equiv' },
			{ label: '\\cong', latex: '\\cong' }, { label: '\\sim', latex: '\\sim' },
			{ label: '\\simeq', latex: '\\simeq' }, { label: '<', latex: '<' }, { label: '>', latex: '>' },
			{ label: '\\leq', latex: '\\leq' }, { label: '\\geq', latex: '\\geq' },
			{ label: '\\ll', latex: '\\ll' }, { label: '\\gg', latex: '\\gg' },
			{ label: '\\prec', latex: '\\prec' }, { label: '\\succ', latex: '\\succ' },
			{ label: '\\doteq', latex: '\\doteq' },
		],
	},
	{ name: 'Greek (lower)', tokens: greek(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'phi', 'chi', 'psi', 'omega']) },
	{ name: 'Greek (upper)', tokens: greek(['Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega']) },
	{
		name: 'Arrows',
		tokens: [
			{ label: '\\leftarrow', latex: '\\leftarrow' }, { label: '\\rightarrow', latex: '\\rightarrow' },
			{ label: '\\uparrow', latex: '\\uparrow' }, { label: '\\downarrow', latex: '\\downarrow' },
			{ label: '\\leftrightarrow', latex: '\\leftrightarrow' }, { label: '\\updownarrow', latex: '\\updownarrow' },
			{ label: '\\Rightarrow', latex: '\\Rightarrow' }, { label: '\\Leftarrow', latex: '\\Leftarrow' },
			{ label: '\\Leftrightarrow', latex: '\\Leftrightarrow' }, { label: '\\mapsto', latex: '\\mapsto' },
			{ label: '\\longrightarrow', latex: '\\longrightarrow' }, { label: '\\rightleftharpoons', latex: '\\rightleftharpoons' },
			{ label: '\\nearrow', latex: '\\nearrow' }, { label: '\\searrow', latex: '\\searrow' },
		],
	},
	{
		name: 'Set & Logic',
		tokens: [
			{ label: '\\in', latex: '\\in' }, { label: '\\notin', latex: '\\notin' }, { label: '\\ni', latex: '\\ni' },
			{ label: '\\subset', latex: '\\subset' }, { label: '\\subseteq', latex: '\\subseteq' },
			{ label: '\\supset', latex: '\\supset' }, { label: '\\supseteq', latex: '\\supseteq' },
			{ label: '\\cup', latex: '\\cup' }, { label: '\\cap', latex: '\\cap' }, { label: '\\setminus', latex: '\\setminus' },
			{ label: '\\emptyset', latex: '\\emptyset' }, { label: '\\forall', latex: '\\forall' },
			{ label: '\\exists', latex: '\\exists' }, { label: '\\nexists', latex: '\\nexists' },
			{ label: '\\land', latex: '\\land' }, { label: '\\lor', latex: '\\lor' }, { label: '\\neg', latex: '\\neg' },
			{ label: '\\oplus', latex: '\\oplus' }, { label: '\\otimes', latex: '\\otimes' },
			{ label: '\\therefore', latex: '\\therefore' }, { label: '\\because', latex: '\\because' },
			{ label: '\\mathbb{R}', latex: '\\mathbb{R}' }, { label: '\\mathbb{Z}', latex: '\\mathbb{Z}' },
			{ label: '\\mathbb{N}', latex: '\\mathbb{N}' }, { label: '\\mathbb{Q}', latex: '\\mathbb{Q}' },
		],
	},
	{
		name: 'Calculus',
		tokens: [
			{ label: '\\partial', latex: '\\partial' }, { label: '\\nabla', latex: '\\nabla' },
			{ label: '\\int', latex: '\\int_{\\square}^{\\square}' }, { label: '\\oint', latex: '\\oint' },
			{ label: '\\sum', latex: '\\sum_{\\square}^{\\square}' }, { label: '\\prod', latex: '\\prod_{\\square}^{\\square}' },
			{ label: '\\lim', latex: '\\lim_{\\square \\to \\square}' }, { label: '\\infty', latex: '\\infty' },
			{ label: 'x^{\\prime}', latex: '\\square^{\\prime}', title: 'Prime' }, { label: 'x^{\\prime\\prime}', latex: '\\square^{\\prime\\prime}', title: 'Double prime' },
			{ label: '\\frac{d}{dx}', latex: '\\frac{d}{d\\square}' }, { label: '\\frac{\\partial}{\\partial x}', latex: '\\frac{\\partial}{\\partial \\square}' },
		],
	},
	{
		name: 'Geometry',
		tokens: [
			{ label: '\\angle', latex: '\\angle' }, { label: '\\measuredangle', latex: '\\measuredangle' },
			{ label: '^{\\circ}', latex: '^{\\circ}', title: 'Degree' }, { label: '\\perp', latex: '\\perp' },
			{ label: '\\parallel', latex: '\\parallel' }, { label: '\\triangle', latex: '\\triangle' },
			{ label: '\\square', latex: '\\square' }, { label: '\\cong', latex: '\\cong' },
			{ label: '\\sim', latex: '\\sim' }, { label: '\\pi', latex: '\\pi' },
			{ label: '\\overset{\\frown}{AB}', latex: '\\overset{\\frown}{\\square}', title: 'Arc' },
		],
	},
	{
		name: 'Chemistry',
		tokens: [
			{ label: '\\rightarrow', latex: '\\rightarrow' }, { label: '\\rightleftharpoons', latex: '\\rightleftharpoons' },
			{ label: '\\overset{\\Delta}{\\rightarrow}', latex: '\\overset{\\Delta}{\\rightarrow}', title: 'Heat over arrow' },
			{ label: 'H_2O', latex: 'H_2O' }, { label: 'X^{n+}', latex: '\\square^{\\square+}', title: 'Ion charge' },
			{ label: '\\Delta', latex: '\\Delta' }, { label: '\\uparrow', latex: '\\uparrow', title: 'Gas' },
			{ label: '\\downarrow', latex: '\\downarrow', title: 'Precipitate' }, { label: '\\cdot', latex: '\\cdot', title: 'Hydrate' },
			{ label: '\\equiv', latex: '\\equiv' },
		],
	},
	{
		name: 'Units & Misc',
		tokens: [
			{ label: '^{\\circ}C', latex: '^{\\circ}\\text{C}' }, { label: '^{\\circ}F', latex: '^{\\circ}\\text{F}' },
			{ label: '\\text{Å}', latex: '\\text{Å}' }, { label: '\\mu', latex: '\\mu' },
			{ label: '\\Omega', latex: '\\Omega' }, { label: '\\ell', latex: '\\ell' },
			{ label: '\\hbar', latex: '\\hbar' }, { label: '\\times 10^{n}', latex: '\\times 10^{\\square}' },
			{ label: '\\pm', latex: '\\pm' }, { label: '\\approx', latex: '\\approx' },
		],
	},
]
