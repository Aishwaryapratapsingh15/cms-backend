import { stripMarkdown, truncate } from './text.util';

describe('truncate', () => {
  it('returns the text unchanged when under the limit', () => {
    expect(truncate('short text', 50)).toBe('short text');
  });

  it('trims whitespace even when under the limit', () => {
    expect(truncate('  short text  ', 50)).toBe('short text');
  });

  it('cuts at a word boundary and appends an ellipsis when over the limit', () => {
    const result = truncate('The quick brown fox jumps over the lazy dog', 20);

    expect(result.length).toBeLessThanOrEqual(21);
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toContain(' …');
    expect(result.slice(0, -1).trim().endsWith(' ')).toBe(false);
  });

  it('hard-cuts when there is no space to break on', () => {
    const result = truncate('supercalifragilisticexpialidocious', 10);

    expect(result).toBe('supercalif…');
  });
});

describe('stripMarkdown', () => {
  it('removes headers', () => {
    expect(stripMarkdown('# Heading\nBody text')).toBe('Heading Body text');
  });

  it('removes bold/italic markers', () => {
    expect(stripMarkdown('This is **bold** and _italic_')).toBe(
      'This is bold and italic',
    );
  });

  it('converts links to their text', () => {
    expect(stripMarkdown('Check [this site](https://example.com) out')).toBe(
      'Check this site out',
    );
  });

  it('removes images entirely', () => {
    expect(stripMarkdown('Before ![alt text](https://example.com/a.png) after')).toBe(
      'Before after',
    );
  });

  it('removes code fences and inline code', () => {
    expect(
      stripMarkdown('Some `inline` code and\n```\nblock code\n```\ndone'),
    ).toBe('Some inline code and done');
  });
});
