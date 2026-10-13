/** AS2 TextFormat (data holder). Undefined properties mean "unchanged / mixed" as in Flash. */
export class TextFormat {
  font?: string;
  size?: number;
  color?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  url?: string;
  target?: string;
  align?: 'left' | 'right' | 'center' | 'justify';
  leftMargin?: number;
  rightMargin?: number;
  indent?: number;
  leading?: number;
  letterSpacing?: number;
  kerning?: boolean;
  constructor(font?: string, size?: number, color?: number, bold?: boolean, italic?: boolean, underline?: boolean,
    url?: string, target?: string, align?: 'left' | 'right' | 'center' | 'justify', leftMargin?: number,
    rightMargin?: number, indent?: number, leading?: number) {
    this.font = font; this.size = size; this.color = color; this.bold = bold; this.italic = italic;
    this.underline = underline; this.url = url; this.target = target; this.align = align; this.leftMargin = leftMargin;
    this.rightMargin = rightMargin; this.indent = indent; this.leading = leading;
  }
}
