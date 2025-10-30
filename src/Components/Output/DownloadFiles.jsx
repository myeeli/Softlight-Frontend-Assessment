// Converts a numeric value to px (e.g., converts 20 to `20px`)
const px = (v) => (typeof v === "number" ? `${v}px` : v);

// Ensures a value is within the range 0–1
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Converts a Figma color object {r,g,b,a} (0–1 values) to CSS rgba()
const rgba = (c) => {
  if (!c) return "transparent";
  const r = Math.round(clamp01(c.r) * 255);
  const g = Math.round(clamp01(c.g) * 255);
  const b = Math.round(clamp01(c.b) * 255);
  const a = c.a == null ? 1 : clamp01(c.a);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

// Returns the first visible fill from an array 
const firstVisible = (arr) =>
  Array.isArray(arr) ? arr.find((f) => f && (f.visible === undefined || f.visible)) : null;

// Gets child coordinates relative to parent container
const relOffset = (childBox, parentBox) => ({
  left: childBox.x - parentBox.x,
  top: childBox.y - parentBox.y,
});

// Creates a safe CSS class name from a Figma node ID
const safeClass = (id) => `n_${String(id || "").replace(/[^a-zA-Z0-9_-]/g, "_")}`;

// Converts a Figma gradient to a CSS linear-gradient()
function gradientToCss(fill) {
  const handles = fill.gradientHandlePositions || [];
  const stops = fill.gradientStops || [];
  if (handles.length >= 2 && stops.length) {
    const dx = handles[1].x - handles[0].x;
    const dy = handles[1].y - handles[0].y;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const stopsCss = stops
      .map((s) => `${rgba(s.color)} ${Math.round((s.position || 0) * 100)}%`)
      .join(", ");
    return `linear-gradient(${angle}deg, ${stopsCss})`;
  }
  const stopsCss = stops
    .map((s) => `${rgba(s.color)} ${Math.round((s.position || 0) * 100)}%`)
    .join(", ");
  return `linear-gradient(180deg, ${stopsCss})`;
}

// Extracts basic layout (position & size) from a node
function extractBoxStyles(node, parentBox) {
  const style = {};
  const box = node.absoluteBoundingBox;
  if (!box) return style;

  if (parentBox) {
    const o = relOffset(box, parentBox);
    style.position = "absolute";
    style.left = px(o.left);
    style.top = px(o.top);
  } else {
    style.position = "relative";
  }

  style.width = px(box.width);
  style.height = px(box.height);
  return style;
}

// Extracts background, border, radius, and clipping
function extractFillAndBorder(node) {
  const style = {};
  const isText = node.type === "TEXT";

  // Background (skip for text since text uses color instead)
  if (!isText) {
    const fill = firstVisible(node.fills) || firstVisible(node.background);
    if (fill?.type === "SOLID") style.background = rgba(fill.color);
    else if (fill?.type === "GRADIENT_LINEAR") style.background = gradientToCss(fill);
    else if (node.backgroundColor) style.background = rgba(node.backgroundColor);
  }

  // Corner radius
  if (Array.isArray(node.rectangleCornerRadii)) {
    const [tl, tr, br, bl] = node.rectangleCornerRadii;
    style["border-top-left-radius"] = px(tl);
    style["border-top-right-radius"] = px(tr);
    style["border-bottom-right-radius"] = px(br);
    style["border-bottom-left-radius"] = px(bl);
  } else if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
    style["border-radius"] = px(node.cornerRadius);
  }

  // Stroke/border
  const stroke = firstVisible(node.strokes);
  if (stroke?.color && node.strokeWeight > 0) {
    style.border = `${px(node.strokeWeight)} solid ${rgba(stroke.color)}`;
  }

  // Hide overflow if frame clips contents
  if (node.clipsContent) style.overflow = "hidden";

  return style;
}

// Extracts text-specific styles (font, alignment, color)
function extractTextStyles(node) {
  if (node.type !== "TEXT") return {};
  const s = node.style || {};
  const style = {};

  if (s.fontSize) style["font-size"] = px(s.fontSize);
  if (s.fontWeight) style["font-weight"] = s.fontWeight;
  if (s.letterSpacing != null) style["letter-spacing"] = px(s.letterSpacing);
  if (s.lineHeightPx) style["line-height"] = px(s.lineHeightPx);
  style["margin"] = "0";
  style["font-family"] = `${JSON.stringify(s.fontFamily || "Inter")}, system-ui, Arial, sans-serif`;

  const textFill = firstVisible(node.fills);
  if (textFill?.type === "SOLID") style.color = rgba(textFill.color);

  const hAlign = (s.textAlignHorizontal || "").toLowerCase();
  if (hAlign) style["text-align"] = hAlign;

  // Vertical centering if Figma used vertical alignment
  if (s.textAlignVertical === "CENTER") {
    style.display = "flex";
    style["align-items"] = "center";
    style["justify-content"] =
      hAlign === "center" ? "center" : hAlign === "right" ? "flex-end" : "flex-start";
  }

  return style;
}

// Recursively converts a Figma node to HTML structure without styling
function nodeToHtml(node) {
  const cls = safeClass(node.id);
  let tag = "div";
  let inner = "";

  if (node.type === "TEXT") {
    tag = (node.style?.fontSize || 0) >= 32 ? "h1" : "p";
    inner = (node.characters || "").replace(/\n/g, "<br/>");
  }

  const children = Array.isArray(node.children) ? node.children : [];
  const kids = children.map((c) => nodeToHtml(c)).join("");

  return `<${tag} class="${cls}">${inner}${kids}</${tag}>`;
}

// Generates the final HTML document wrapper
export function generateHtmlFromFrame(frameNode) {
  const content = nodeToHtml(frameNode);
  const rootBox = frameNode.absoluteBoundingBox || { width: 393, height: 852 };
  const W = Math.round(rootBox.width);
  const H = Math.round(rootBox.height);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${frameNode.name}</title>
  <link rel="stylesheet" href="styles.css"/>
  <style>
    html, body { height: 100dvh; margin: 0; }
    body { background: #f6f7f9; }
    #stage {
      min-height: 100dvh;
      width: 100%;
      display: grid;
      place-items: center;
      overflow: auto;
      padding: 16px;
      box-sizing: border-box;
    }
    #frame {
      width: ${W}px;
      height: ${H}px;
      transform-origin: top left;
    }
  </style>
</head>
<body>
  <div id="stage">
    <div id="frame-sizer">
      <div id="frame">
        ${content}
      </div>
    </div>
  </div>
  <script>
    (function () {
      var W = ${W}, H = ${H};
      var frame = document.getElementById('frame');
      var sizer = document.getElementById('frame-sizer');

      function fit() {
        var vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0) - 32;
        var vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0) - 32;
        var scale = Math.min(vw / W, vh / H);
        scale = Math.max(0.1, Math.min(1, scale));
        frame.style.transform = 'scale(' + scale + ')';
        sizer.style.width = (W * scale) + 'px';
        sizer.style.height = (H * scale) + 'px';
      }

      window.addEventListener('resize', fit);
      document.addEventListener('DOMContentLoaded', fit);
      fit();
    })();
  </script>
</body>
</html>`;
}

// Generates CSS for every node 
export function generateCssFromFrame(rootNode, parentBox = null) {
  const safeCls = `.${safeClass(rootNode.id)}`;
  const boxStyles = extractBoxStyles(rootNode, parentBox);
  const visual = { ...extractFillAndBorder(rootNode), ...extractTextStyles(rootNode) };

  const rule =
    `${safeCls} {\n` +
    Object.entries({ ...boxStyles, ...visual })
      .map(([k, v]) => `  ${k}: ${v};`)
      .join("\n") +
    `\n}\n`;

  let childCss = "";
  const box = rootNode.absoluteBoundingBox || parentBox;

  if (Array.isArray(rootNode.children)) {
    for (const child of rootNode.children) {
      childCss += generateCssFromFrame(child, rootNode.absoluteBoundingBox || box);
    }
  }

  return rule + childCss;
}
