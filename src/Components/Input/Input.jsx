import React, { useState } from "react";
import { generateCssFromFrame, generateHtmlFromFrame } from "../Output/DownloadFiles";
import { saveAs } from "file-saver";
import styles from "./Input.module.css";

export default function Input() {
  // Stores the URL entered by the user
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Figma personal access token stored in .env
  const token = process.env.REACT_APP_FIGMA_TOKEN;

  /**
   * Checks if the given URL is a valid Figma design link.
   */
  const isFigmaUrl = (url) => {
  try {
    const u = new URL(url.trim());
    if (!u.hostname.endsWith("figma.com")) return false;
    return /\/[A-Za-z0-9]{22}(\/|$)/.test(u.pathname);
  } catch {
    return false;
  }
};

/**
   * Extracts the Figma file key from the URL.
   * Example: https://www.figma.com/design/ABC123/... → "ABC123"
   */
const extractKey = (url) => {
  try {
    const m = url.match(/\/([A-Za-z0-9]{22})(\/|$)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
   * Called when the user clicks "Download Files".
   * Fetches the Figma file → extracts a frame → converts to HTML + CSS → downloads them.
   */
  const downloadFile = (filename, text, type) => {
    const blob = new Blob([text], { type });
    saveAs(blob, filename);
  };

  const pickBestExportNode = (root) => {
    if (!root) return null;
    const primary = new Set(["FRAME", "COMPONENT", "INSTANCE"]);
    const secondary = new Set(["SECTION", "GROUP"]);

    const area = (n) =>
      n?.absoluteBoundingBox
        ? (n.absoluteBoundingBox.width || 0) * (n.absoluteBoundingBox.height || 0)
        : 0;

    const q = [root];
    let bestP = null, bestS = null;
    while (q.length) {
      const n = q.shift();
      if (!n) continue;
      const a = area(n);
      if (primary.has(n.type)) {
        if (!bestP || a > bestP.area) bestP = { node: n, area: a };
      } else if (secondary.has(n.type)) {
        if (!bestS || a > bestS.area) bestS = { node: n, area: a };
      }
      if (Array.isArray(n.children)) q.push(...n.children);
    }
    return bestP?.node || bestS?.node || null;
  };

  const collectIds = (node, acc = new Set()) => {
    if (!node || node.visible === false) return acc;

    const needsImage = () => {
      // if a node contains IMAGE fills or is a vector-type shape, convert it to an image output
      const fills = Array.isArray(node.fills) ? node.fills : [];
      const hasImageFill = fills.some((f) => f?.type === "IMAGE" && f.visible !== false);
      const vectorish = new Set([
        "ELLIPSE",
        "VECTOR",
        "LINE",
        "STAR",
        "POLYGON",
        "BOOLEAN_OPERATION",
        "REGULAR_POLYGON",
        "ARROW",
      ]);
      return hasImageFill || vectorish.has(node.type);
    };

    if (needsImage() && node.id) acc.add(node.id);
    (node.children || []).forEach((c) => collectIds(c, acc));
    return acc;
  };

  // Fetch /images to get signed PNG URLs for the node ids
  const fetchImageUrls = async (fileKey, ids, scale = 2) => {
    if (!ids.size) return {};
    const idsCsv = Array.from(ids).join(",");
    const resp = await fetch(
      `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(idsCsv)}&format=png&scale=${scale}`,
      { headers: { "X-Figma-Token": token } }
    );
    const json = await resp.json();
    return json?.images || {};
  };

  const handleSubmit = async () => {
    if (!isFigmaUrl(input)) return alert("Enter a valid Figma URL.");
    if (!token) return alert("Missing REACT_APP_FIGMA_TOKEN");
    

    setBusy(true);
    try {
      const key = extractKey(input);
      if (!key) throw new Error("Could not extract file key from URL.");

      // Step 1: Fetch entire Figma file structure
      const fileRes = await fetch(`https://api.figma.com/v1/files/${key}`, {
        headers: { "X-Figma-Token": token },
      });
      const fileJson = await fileRes.json();

      // Step 2: Pick the main frame/instance/component/section
      const exportRoot = pickBestExportNode(fileJson.document);
      if (!exportRoot) throw new Error("No exportable frame found.");
      const rootId = exportRoot.id;

      // Step 3: Fetch the subtree with depth and styles resolved
      const nodesRes = await fetch(
        `https://api.figma.com/v1/files/${key}/nodes?ids=${encodeURIComponent(rootId)}&depth=20`,
        { headers: { "X-Figma-Token": token } }
      );
      const nodesJson = await nodesRes.json();
      const frameNode = nodesJson?.nodes?.[rootId]?.document;
      if (!frameNode) throw new Error("Could not load frame node details.");

      // Step 4: Collect ids to convert to images (images/vectors) and fetch PNG URLs
      const ids = collectIds(frameNode);
      const imagesMap = await fetchImageUrls(key, ids, 2);

      const htmlFileName = rootId + ".html";
      const cssFileName = rootId + ".css";


      // Step 5: Generate HTML/CSS with images and auto-layout support
      const html = generateHtmlFromFrame(frameNode, imagesMap);
      const css = generateCssFromFrame(frameNode, imagesMap);

      // Step 6: Download files
      downloadFile(htmlFileName, html, "text/html;charset=utf-8");
      downloadFile("styles.css", css, "text/css;charset=utf-8");
    } catch (err) {
      console.error(err);
      alert(err.message || "Unexpected error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <input
          className={styles.inputField}
          type="text"
          placeholder="Paste any Figma template link (file/design/proto or community/file)"
          onChange={(e) => setInput(e.target.value)}
          value={input}
        />
        <button className={styles.button} onClick={handleSubmit} disabled={busy}>
          {busy ? "Generating…" : "Download Files"}
        </button>
      </div>
    </div>
  );
}
