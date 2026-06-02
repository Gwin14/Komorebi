import MarkdownViewer from "./MarkdownViewer";

export default function TermosDeUso() {
  return <MarkdownViewer source={require("../docs/termos-de-uso.md")} />;
}
