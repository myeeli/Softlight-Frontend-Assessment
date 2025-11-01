import { generateHtmlFromFrame, generateCssFromFrame } from './DownloadFiles';

// making a sample text node
const mkText = (id, x, y, w, h, text, fontSize = 24) => ({
  id,
  type: 'TEXT',
  visible: true,
  characters: text,
  style: { fontSize, fontFamily: 'Inter', lineHeightPx: 28, textAlignHorizontal: 'LEFT' },
  absoluteBoundingBox: { x, y, width: w, height: h },
  fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }]
});

// making a sample rectangle node
const mkRect = (id, x, y, w, h, color = { r: 1, g: 1, b: 1, a: 1 }) => ({
  id,
  type: 'RECTANGLE',
  visible: true,
  absoluteBoundingBox: { x, y, width: w, height: h },
  fills: [{ type: 'SOLID', color }]
});

// Sample frame with one background and one text
const frameNode = {
  id: 'F1',
  type: 'FRAME',
  name: 'Sample',
  visible: true,
  absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
  children: [
    mkRect('BG', 0, 0, 400, 300, { r: 0.8, g: 0.95, b: 0.9, a: 1 }),
    mkText('T1', 20, 20, 200, 40, 'Hello'),
  ]
};

describe('DownloadFiles generators', () => {
  // HTML output links to default CSS file and includes class names
  test('generateHtmlFromFrame links to default styles.css', () => {
    const html = generateHtmlFromFrame(frameNode, {}, 'styles.css');
    expect(html).toContain('<link rel="stylesheet" href="./styles.css"/>');
    expect(html).toContain('id="frame"');
    // class names should match node ids
    expect(html).toContain('class="n_F1"');
    expect(html).toContain('class="n_T1"');
  });

  // custom CSS file name is correctly used
  test('generateHtmlFromFrame accepts custom css file name', () => {
    const html = generateHtmlFromFrame(frameNode, {}, 'custom-name.css');
    expect(html).toContain('<link rel="stylesheet" href="./custom-name.css"/>');
  });

  // CSS output should include positions, frame, and background color
  test('generateCssFromFrame positions nodes and sets colors', () => {
    const css = generateCssFromFrame(frameNode, {});
    // frame container should exist
    expect(css).toContain('#frame');
    // rectangle node should exist
    expect(css).toContain('.n_BG');
    // positions are written as left/top in px
    expect(css).toMatch(/left:\s*0px/);
    expect(css).toMatch(/top:\s*0px/);
    // background color is written in rgba format
    expect(css).toMatch(/background:\s*rgba\(/);
  });

  // small grouped icons use background image from imagesMap
  test('uses image map for small vector/shape containers', () => {
    const withIcon = {
      ...frameNode,
      children: [
        ...frameNode.children,
        {
          id: 'ICON',
          type: 'GROUP',
          visible: true,
          absoluteBoundingBox: { x: 350, y: 10, width: 24, height: 24 },
          children: [{
            id: 'V1',
            type: 'VECTOR',
            visible: true,
            absoluteBoundingBox: { x: 350, y: 10, width: 24, height: 24 },
            fills: []
          }]
        }
      ]
    };
    const imagesMap = { ICON: 'https://example.com/icon.png' };
    const css = generateCssFromFrame(withIcon, imagesMap);
    expect(css).toContain('.n_ICON');
    expect(css).toContain('background-image: url("https://example.com/icon.png")');
  });
});
