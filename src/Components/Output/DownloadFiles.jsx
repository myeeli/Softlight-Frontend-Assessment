// Converts a numeric value to px (e.g., converts 20 to `20px`)
const px = (v) => (typeof v === "number" ? `${Math.round(v)}px` : v);

// Ensures a value is within the range 0–1
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// Converts a Figma color object {r,g,b,a} (0–1 values) to CSS rgba()
const rgba = (c, alpha) => {
  if (!c) return "transparent";
  const r = Math.round(clamp01(c.r) * 255);
  const g = Math.round(clamp01(c.g) * 255);
  const b = Math.round(clamp01(c.b) * 255);
  const a = alpha != null ? alpha : c.a == null ? 1 : clamp01(c.a);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

// Returns the first visible fill from an array 
const firstVisible = (arr) =>
  Array.isArray(arr) ? arr.find((f) => f && (f.visible === undefined || f.visible)) : null;

// Creates a safe CSS class name from a Figma node ID
const safeClass = (id) => `n_${String(id || "").replace(/[^a-zA-Z0-9_-]/g, "_")}`;

// Converts a Figma gradient to a CSS linear-gradient()
const gradientToCss = (fill) => {
  const handles = fill.gradientHandlePositions || [];
  const stops = fill.gradientStops || [];
  if (!stops.length) return null;
  let angle = 180;
  if (handles.length >= 2) {
    const dx = handles[1].x - handles[0].x;
    const dy = handles[1].y - handles[0].y;
    angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  }
  const stopsCss = stops
    .map((s) => `${rgba(s.color, s.color?.a)} ${Math.round((s.position || 0) * 100)}%`)
    .join(", ");
  return `linear-gradient(${Math.round(angle)}deg, ${stopsCss})`;
};

const cssLine = (k, v) => (v != null && v !== "" ? `  ${k}: ${v};\n` : "");
const makeRule = (sel, obj) => {
  let s = `${sel} {\n`;
  for (const [k, v] of Object.entries(obj)) s += cssLine(k, v);
  s += `}\n`;
  return s;
};

function escapeHtml(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// Generates the HTML structure
export function generateHtmlFromFrame(frameNode, imagesMap = {}, cssFileName = "styles.css") {
  const rootBox = frameNode.absoluteBoundingBox || { width: 390, height: 844 };
  const W = Math.round(rootBox.width);
  const H = Math.round(rootBox.height);

  const nodeToHtml = (node) => {
    if (!node || node.visible === false) return "";
    const cls = safeClass(node.id);

    // If this node uses an image background, just create a simple div for it
    const modifiedUrl = imagesMap[node.id];
    if (modifiedUrl && shouldTreatAsSingleContainer(node)) {
      // Skip its children and use the image as background in CSS
      return `<div class="${cls}"></div>`;
    }

    // For shapes or small icons, use an <img> tag
    const isVectorLike = ["ELLIPSE", "VECTOR", "LINE", "STAR", "POLYGON", "BOOLEAN_OPERATION", "REGULAR_POLYGON", "ARROW"].includes(node.type);
    if (modifiedUrl && (isVectorLike || (!node.children || node.children.length === 0))) {
      return `<img class="${cls}" alt="" src="${modifiedUrl}" />`;
    }

    // For text or groups, create normal tags and include child elements
    const tag = node.type === "TEXT" ? ((node.style?.fontSize || 0) >= 32 ? "h1" : "p") : "div";
    const kids = (node.children || []).map(nodeToHtml).join("");
    const inner = node.type === "TEXT" ? (node.characters || "").replace(/\n/g, "<br/>") : "";

    return `<${tag} class="${cls}">${inner}${kids}</${tag}>`;
  };

  const content = nodeToHtml(frameNode);

  // Create full HTML page with style and scaling
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(frameNode.name || "Export")}</title>
  <link rel="stylesheet" href="./${cssFileName}"/>
  <style>
    html, body { height: 100%; margin: 0; }
    body { background:#f6f7f9; }
    #stage { min-height:100vh; display:grid; place-items:center; padding:16px; box-sizing:border-box; }
    #frame { width:${W}px; height:${H}px; position:relative; transform-origin: top left; isolation:isolate; }
    img { display:block; }
  </style>
</head>
<body>
  <div id="stage">
    <div id="frame">${content}</div>
  </div>
  <script>
    (function () {
      var frame = document.getElementById('frame');
      var W = ${W}, H = ${H};
      function fit() {
        var vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0) - 32;
        var vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0) - 32;
        var scale = Math.min(vw / W, vh / H);
        scale = Math.max(0.2, Math.min(1, scale));
        frame.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', fit); fit();
    })();
  </script>
</body>
</html>`;
}


// Generates CSS for every node
export function generateCssFromFrame(rootNode, imagesMap = {}) {
  let css = "";
  let zCounter = 0;

  const emitNode = (node, origin) => {
    if (!node || node.visible === false) return;
    const cls = `.${safeClass(node.id)}`;
    const abb = node.absoluteBoundingBox || null;

    // Set the size and position for each element
    const layout = {};
    if (abb) {
      layout.position = origin ? "absolute" : "relative";
      if (origin) {
        layout.left = px(abb.x - origin.x);
        layout.top = px(abb.y - origin.y);
      }
      layout.width = px(abb.width);
      layout.height = px(abb.height);
    } else {
      layout.position = origin ? "absolute" : "relative";
    }

    layout["z-index"] = ++zCounter;

    const visuals = {};
    const modifiedUrl = imagesMap[node.id];

    // If the node uses an image background, set the background image and skip children
    if (modifiedUrl && shouldTreatAsSingleContainer(node)) {
      visuals["background-image"] = `url("${modifiedUrl}")`;
      visuals["background-repeat"] = "no-repeat";
      visuals["background-size"] = "contain";
      visuals["background-position"] = "center";
      css += makeRule(cls, { ...layout, ...visuals });
      return;
    }

    // For normal shapes and text
    if (node.type !== "TEXT") {
      // Handle fills, gradients, or images
      if (modifiedUrl) {
        visuals["background-image"] = `url("${modifiedUrl}")`;
        visuals["background-repeat"] = "no-repeat";
        visuals["background-size"] = "cover";
        visuals["background-position"] = "center";
      } else {
        const fill = firstVisible(node.fills) || firstVisible(node.background);
        if (fill?.type === "SOLID") visuals["background"] = rgba(fill.color, fill.opacity);
        else if (fill?.type?.startsWith("GRADIENT")) {
          const g = gradientToCss(fill);
          if (g) visuals["background"] = g;
        } else if (node.backgroundColor) {
          visuals["background"] = rgba(node.backgroundColor);
        }
      }

      // Rounded corners
      if (Array.isArray(node.rectangleCornerRadii)) {
        const [tl, tr, br, bl] = node.rectangleCornerRadii;
        visuals["border-top-left-radius"] = px(tl);
        visuals["border-top-right-radius"] = px(tr);
        visuals["border-bottom-right-radius"] = px(br);
        visuals["border-bottom-left-radius"] = px(bl);
      } else if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
        visuals["border-radius"] = px(node.cornerRadius);
      }

      // Border
      const stroke = firstVisible(node.strokes);
      const strokeW = node.strokeWeight ?? node.strokeWidth;
      if (stroke?.color && strokeW > 0) {
        visuals["border"] = `${px(strokeW)} solid ${rgba(stroke.color, stroke.opacity)}`;
      }

      if (node.clipsContent) visuals["overflow"] = "hidden";
    } else {
      // For text elements
      const s = node.style || {};
      visuals["margin"] = "0";
      if (s.fontSize) visuals["font-size"] = px(s.fontSize);
      if (s.fontWeight) visuals["font-weight"] = s.fontWeight;
      if (s.letterSpacing != null) visuals["letter-spacing"] = px(s.letterSpacing);
      if (s.lineHeightPx) visuals["line-height"] = px(s.lineHeightPx);
      if (abb) {
        visuals["width"] = px(abb.width);
        visuals["height"] = px(abb.height);
        visuals["overflow"] = "hidden"; // Keeps text within its box
      }
      visuals["white-space"] = "pre-wrap";
      const family =
        s.fontFamily || (typeof s.fontName === "object" ? s.fontName.family : null) || "Inter";
      visuals["font-family"] = `${JSON.stringify(family)}, system-ui, Arial, sans-serif`;
      const textFill = firstVisible(node.fills);
      if (textFill?.type === "SOLID") visuals["color"] = rgba(textFill.color, textFill.opacity);
      const hAlign = (s.textAlignHorizontal || "").toLowerCase();
      if (hAlign) visuals["text-align"] = hAlign;
    }

    css += makeRule(cls, { ...layout, ...visuals });

    const nextOrigin = abb ? { x: abb.x, y: abb.y } : origin;
    (node.children || []).forEach((c) => emitNode(c, nextOrigin));
  };

  // Create a container for the full frame
  const rb = rootNode.absoluteBoundingBox || { width: 390, height: 844 };
  css += makeRule("#frame", {
    position: "relative",
    width: px(rb.width),
    height: px(rb.height),
    isolation: "isolate",
  });

  emitNode(rootNode, null);
  return `/* Generated by Softlight Figma → HTML/CSS */\n${css}`;
}

/**
 * Checks if a small group similar to icons should be replaced by a single image background.
 */
function shouldTreatAsSingleContainer(node) {
  const abb = node.absoluteBoundingBox;
  if (!abb) return false;
  const small = (abb.width <= 128 && abb.height <= 128);
  const kind = new Set(["GROUP", "COMPONENT", "INSTANCE", "COMPONENT_SET"]);
  if (!small || !kind.has(node.type)) return false;

  // If the group contains shapes or image fills, use it as a single image
  const vectorish = new Set(["ELLIPSE", "VECTOR", "LINE", "STAR", "POLYGON", "BOOLEAN_OPERATION", "REGULAR_POLYGON", "ARROW"]);
  const stack = [...(node.children || [])];
  while (stack.length) {
    const n = stack.pop();
    if (!n || n.visible === false) continue;
    const fills = Array.isArray(n.fills) ? n.fills : [];
    const hasImageFill = fills.some((f) => f?.type === "IMAGE" && f.visible !== false);
    if (hasImageFill || vectorish.has(n.type)) return true;
    (n.children || []).forEach((c) => stack.push(c));
  }
  return false;
}
