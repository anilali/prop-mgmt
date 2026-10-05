import {
  Document,
  Font,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type {
  LetterDocument,
  StatementData,
  StatementDocument,
  StatementRenderer,
} from "@moonship/billing";
import { letterDocument, statementDocument } from "@moonship/billing";

Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    paddingVertical: 60,
    paddingHorizontal: 64,
    fontSize: 11,
    fontFamily: "Helvetica",
    lineHeight: 1.35,
  },
  bold: { fontFamily: "Helvetica-Bold" },
  block: { marginBottom: 16 },
  re: { flexDirection: "row", marginBottom: 16 },
  reLabel: { width: 36 },
  paragraph: { marginBottom: 12 },
  signature: { marginTop: 36 },
  statementPage: {
    paddingVertical: 48,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
    lineHeight: 1.3,
  },
  heading: {
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    fontSize: 11,
  },
  subheading: { textAlign: "center" },
  areas: { marginTop: 16, marginBottom: 12 },
  costLine: { flexDirection: "row" },
  costName: { width: 120, fontFamily: "Helvetica-Bold" },
  costAmount: { width: 90, textAlign: "right" },
  costRate: { width: 110, textAlign: "right" },
  billNote: { fontSize: 8, marginLeft: 12, marginBottom: 2 },
  table: { marginTop: 16 },
  tableRow: { flexDirection: "row", paddingVertical: 3 },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    paddingBottom: 3,
  },
  headerCell: {
    flex: 1,
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    textAlign: "right",
    paddingHorizontal: 2,
  },
  firstCell: { flex: 1.2, textAlign: "left" },
  cell: { flex: 1, textAlign: "right", paddingHorizontal: 2 },
  totalCell: {
    flex: 1,
    textAlign: "right",
    paddingHorizontal: 2,
    paddingTop: 3,
    borderTopWidth: 1,
    borderTopColor: "#000000",
    fontFamily: "Helvetica-Bold",
  },
  rentBlock: { marginTop: 24, width: 300 },
  rentHeading: { fontFamily: "Helvetica-Bold", marginBottom: 4 },
  rentLine: { flexDirection: "row", paddingVertical: 2 },
  rentLabel: { flex: 1 },
  rentValue: { width: 100, textAlign: "right" },
  rentTotal: {
    borderTopWidth: 1,
    borderTopColor: "#000000",
    fontFamily: "Helvetica-Bold",
  },
});

function Lines({ lines }: { lines: string[] }) {
  return (
    <View>
      {lines.map((line, index) => (
        <Text key={index}>{line}</Text>
      ))}
    </View>
  );
}

function LetterPage({ letter }: { letter: LetterDocument }) {
  return (
    <Page size="LETTER" style={styles.page}>
      <Text style={styles.block}>{letter.date}</Text>
      <View style={styles.block}>
        <Lines lines={letter.recipient} />
      </View>
      <View style={styles.re}>
        <Text style={[styles.reLabel, styles.bold]}>Re:</Text>
        <View>
          {letter.re.map((line, index) => (
            <Text key={index} style={index === 0 ? styles.bold : {}}>
              {line}
            </Text>
          ))}
        </View>
      </View>
      {letter.paragraphs.map((paragraph, index) => (
        <Text key={index} style={styles.paragraph}>
          {paragraph.map((run, runIndex) =>
            run.bold ? (
              <Text key={runIndex} style={styles.bold}>
                {run.text}
              </Text>
            ) : (
              run.text
            ),
          )}
        </Text>
      ))}
      <Text>{letter.closing}</Text>
      <View style={styles.signature}>
        <Lines lines={letter.signature} />
      </View>
    </Page>
  );
}

function StatementPage({ statement }: { statement: StatementDocument }) {
  const [title, ...subtitles] = statement.heading;
  const lastColumn = statement.table.columns.length - 1;
  return (
    <Page size="LETTER" style={styles.statementPage}>
      <Text style={styles.heading}>{title}</Text>
      {subtitles.map((line, index) => (
        <Text
          key={index}
          style={index === 0 ? styles.heading : styles.subheading}
        >
          {line}
        </Text>
      ))}
      <View style={styles.areas}>
        <Lines lines={statement.areas} />
      </View>
      <View>
        {statement.costLines.map((line, index) => (
          <View key={index}>
            <View style={styles.costLine}>
              <Text style={styles.costName}>{line.name}</Text>
              <Text style={styles.costAmount}>{line.actual}</Text>
              <Text style={styles.costRate}>{line.perYear}</Text>
              <Text style={styles.costRate}>{line.perMonth}</Text>
            </View>
            {line.billNote ? (
              <Text style={styles.billNote}>{line.billNote}</Text>
            ) : null}
          </View>
        ))}
      </View>
      <View style={styles.table}>
        <View style={styles.headerRow}>
          {statement.table.columns.map((column, index) => (
            <Text
              key={index}
              style={[styles.headerCell, index === 0 ? styles.firstCell : {}]}
            >
              {column}
            </Text>
          ))}
        </View>
        {statement.table.rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.tableRow}>
            {row.map((value, index) => (
              <Text
                key={index}
                style={[styles.cell, index === 0 ? styles.firstCell : {}]}
              >
                {value}
              </Text>
            ))}
          </View>
        ))}
        <View style={styles.tableRow}>
          {statement.table.columns.map((_, index) => (
            <Text
              key={index}
              style={
                index === lastColumn
                  ? styles.totalCell
                  : [styles.cell, index === 0 ? styles.firstCell : {}]
              }
            >
              {index === lastColumn ? statement.table.total : ""}
            </Text>
          ))}
        </View>
      </View>
      <View style={styles.rentBlock}>
        {statement.rentBlock.heading ? (
          <Text style={styles.rentHeading}>{statement.rentBlock.heading}</Text>
        ) : null}
        {statement.rentBlock.lines.map((line, index) => (
          <View key={index} style={styles.rentLine}>
            <Text style={styles.rentLabel}>{line.label}</Text>
            <Text
              style={
                line.total
                  ? [styles.rentValue, styles.rentTotal]
                  : styles.rentValue
              }
            >
              {line.value}
            </Text>
          </View>
        ))}
      </View>
    </Page>
  );
}

export function StatementPdf({ data }: { data: StatementData }) {
  return (
    <Document
      title={`${data.year} Expense Reconciliation ${data.tenant.businessName} ${data.unit.label}`}
      author={data.owner.company}
    >
      <LetterPage letter={letterDocument(data)} />
      <StatementPage statement={statementDocument(data)} />
    </Document>
  );
}

export class ReactPdfStatementRenderer implements StatementRenderer {
  async render(data: StatementData): Promise<Uint8Array> {
    const buffer = await renderToBuffer(<StatementPdf data={data} />);
    return new Uint8Array(buffer);
  }
}
