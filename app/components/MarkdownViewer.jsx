import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import BackButton from "./BackButton";

function mdToHtml(md) {
  const lines = md.split("\n");
  const result = [];
  let inList = false;
  let inOrderedList = false;
  let inTable = false;

  const closeTable = () => {
    if (inTable) {
      result.push("</tbody></table>");
      inTable = false;
    }
  };
  const closeList = () => {
    if (inList) {
      result.push("</ul>");
      inList = false;
    }
  };
  const closeOList = () => {
    if (inOrderedList) {
      result.push("</ol>");
      inOrderedList = false;
    }
  };
  const closeAll = () => {
    closeList();
    closeOList();
    closeTable();
  };

  const isSep = (line) =>
    line.startsWith("|") &&
    line
      .split("|")
      .filter((c) => c !== "")
      .every((c) => /^[\s\-:]+$/.test(c));

  const inline = (text) =>
    text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  for (const line of lines) {
    const t = line.trim();
    const headingMatch = line.match(/^(#{1,4}) /);

    if (headingMatch) {
      closeAll();
      const level = headingMatch[1].length;
      result.push(`<h${level}>${inline(line.slice(level + 1))}</h${level}>`);
    } else if (/^---+$/.test(t)) {
      closeAll();
      result.push("<hr>");
    } else if (t.startsWith("|")) {
      if (isSep(t)) {
        // separator row, skip
      } else if (!inTable) {
        closeAll();
        const cells = t
          .split("|")
          .filter((c) => c !== "")
          .map((c) => `<th>${inline(c.trim())}</th>`)
          .join("");
        result.push(`<table><thead><tr>${cells}</tr></thead><tbody>`);
        inTable = true;
      } else {
        const cells = t
          .split("|")
          .filter((c) => c !== "")
          .map((c) => `<td>${inline(c.trim())}</td>`)
          .join("");
        result.push(`<tr>${cells}</tr>`);
      }
    } else if (/^- /.test(line)) {
      closeTable();
      closeOList();
      if (!inList) {
        result.push("<ul>");
        inList = true;
      }
      result.push(`<li>${inline(line.slice(2).trim())}</li>`);
    } else if (/^\d+\. /.test(line)) {
      closeTable();
      closeList();
      if (!inOrderedList) {
        result.push("<ol>");
        inOrderedList = true;
      }
      result.push(`<li>${inline(line.replace(/^\d+\.\s*/, "").trim())}</li>`);
    } else if (t === "") {
      closeAll();
    } else {
      closeAll();
      result.push(`<p>${inline(t)}</p>`);
    }
  }

  closeAll();
  return result.join("\n");
}

function buildHtml(content) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { background: #000; color: #e0e0e0; font-family: -apple-system, sans-serif;
           padding: 16px 18px 40px; font-size: 15px; line-height: 1.65; }
    h1 { color: #ffaa00; font-size: 20px; margin: 24px 0 8px; }
    h2 { color: #ffaa00; font-size: 17px; margin: 20px 0 6px; }
    h3 { color: #d5d2ce; font-size: 15px; margin: 14px 0 4px; }
    h4 { color: #d5d2ce; font-size: 14px; margin: 10px 0 4px; }
    hr { border: none; border-top: 1px solid #2a2a2a; margin: 14px 0; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
    th { background: #111; color: #ffaa00; padding: 8px 10px; border: 1px solid #2a2a2a; text-align: left; }
    td { padding: 7px 10px; border: 1px solid #2a2a2a; vertical-align: top; }
    tr:nth-child(even) td { background: #0a0a0a; }
    ul, ol { padding-left: 22px; margin: 4px 0; }
    li { margin: 3px 0; }
    strong { color: #d5d2ce; }
    em { color: #d5d2ce; font-style: italic; }
    code { background: #1a1a1a; color: #ffaa00; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
    a { color: #ffaa00; text-decoration: underline; }
    p { margin: 6px 0; }
  </style>
</head>
<body>${mdToHtml(content)}</body>
</html>`;
}

export default function MarkdownViewer({ source }) {
  const [html, setHtml] = useState(null);

  useEffect(() => {
    async function load() {
      const asset = Asset.fromModule(source);
      await asset.downloadAsync();
      const content = await FileSystem.readAsStringAsync(asset.localUri);
      setHtml(buildHtml(content));
    }
    load();
  }, [source]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {html ? (
        <WebView
          source={{ html }}
          style={styles.webview}
          originWhitelist={["*"]}
          javaScriptEnabled={false}
        />
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator color="#ffaa00" size="large" />
        </View>
      )}
      <BackButton />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  webview: { flex: 1, backgroundColor: "#000" },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
});
