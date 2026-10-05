import {
  Document,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
} from "@react-pdf/renderer";

export interface SpikePdfInput {
  propertyName: string;
  date: string;
}

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 12, fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 12, fontFamily: "Helvetica-Bold" },
});

export function renderSpikePdf(input: SpikePdfInput): Promise<Buffer> {
  return renderToBuffer(
    <Document title={`${input.propertyName} test PDF`}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>{input.propertyName}</Text>
        <Text>{input.date}</Text>
      </Page>
    </Document>,
  );
}
