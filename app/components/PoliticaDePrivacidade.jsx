import MarkdownViewer from "./MarkdownViewer";

export default function PoliticaDePrivacidade() {
  return (
    <MarkdownViewer source={require("../docs/politica-de-privacidade.md")} />
  );
}
