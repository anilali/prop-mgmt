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
  StatementRentLine,
  StatementTable,
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
  title: {
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    fontSize: 12,
    marginBottom: 16,
  },
  areaLine: { flexDirection: "row" },
  areaLabel: { width: 190 },
  areaValue: { width: 50, textAlign: "right" },
  areaUnit: { marginLeft: 4 },
  sectionHeading: {
    fontFamily: "Helvetica-Bold",
    marginTop: 16,
    marginBottom: 6,
  },
  costLine: { flexDirection: "row" },
  costName: { width: 90 },
  costAmount: { width: 80, textAlign: "right" },
  costRates: { width: 120 },
  costRate: { textAlign: "right" },
  billNote: { fontSize: 8, marginLeft: 12, marginBottom: 2 },
  costGroup: { marginBottom: 4 },
  table: { fontSize: 8 },
  tableRow: { flexDirection: "row" },
  tenantColumn: { flex: 1, paddingRight: 6 },
  headerBox: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
  },
  headerCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    textAlign: "center",
    paddingHorizontal: 2,
    paddingVertical: 3,
    borderLeftWidth: 1,
    borderLeftColor: "#000000",
  },
  lastHeaderCell: { borderRightWidth: 1, borderRightColor: "#000000" },
  body: { flexDirection: "row", marginTop: 4 },
  cell: { textAlign: "right", paddingHorizontal: 3, paddingVertical: 2 },
  poolCell: { textAlign: "left" },
  totalRow: { flexDirection: "row", marginTop: 4 },
  totalCell: {
    textAlign: "right",
    paddingHorizontal: 3,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#000000",
    fontFamily: "Helvetica-Bold",
  },
  rentBlock: { marginTop: 24 },
  rentHeadingRow: { flexDirection: "row", marginBottom: 6 },
  rentHeading: { fontFamily: "Helvetica-Bold", marginRight: 16 },
  rentLine: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  rentLabel: { width: 190 },
  rentValue: {
    width: 80,
    textAlign: "right",
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  rentTotalLine: { marginTop: 2, marginBottom: 8 },
  rentTotalValue: {
    borderTopWidth: 1,
    borderTopColor: "#000000",
    fontFamily: "Helvetica-Bold",
  },
  rentBoxedLine: { marginTop: 4 },
  rentBoxedValue: {
    borderWidth: 1,
    borderColor: "#000000",
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

const LEADING_WIDTHS = [42, 56, 62, 54];
const MONTHS_WIDTH = 34;
const TRAILING_WIDTHS = [58, 64, 58];

function columnWidths(columns: readonly string[]): number[] {
  const showMonths =
    columns.length > LEADING_WIDTHS.length + TRAILING_WIDTHS.length;
  return [
    ...LEADING_WIDTHS,
    ...(showMonths ? [MONTHS_WIDTH] : []),
    ...TRAILING_WIDTHS,
  ];
}

function StatementTableView({ table }: { table: StatementTable }) {
  const widths = columnWidths(table.columns);
  const lastIndex = widths.length - 1;
  return (
    <View style={styles.table}>
      <View style={styles.tableRow}>
        <View style={styles.tenantColumn} />
        <View style={styles.headerBox}>
          {table.columns.map((column, index) => (
            <Text
              key={index}
              style={[
                styles.headerCell,
                { width: widths[index] },
                index === lastIndex ? styles.lastHeaderCell : {},
              ]}
            >
              {column}
            </Text>
          ))}
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.tenantColumn}>
          <Lines lines={table.tenantLines} />
        </View>
        <View>
          {table.rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.tableRow}>
              {row.map((value, index) => (
                <Text
                  key={index}
                  style={[
                    styles.cell,
                    { width: widths[index] },
                    index === 1 ? styles.poolCell : {},
                  ]}
                >
                  {value}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </View>
      <View style={styles.totalRow}>
        <View style={styles.tenantColumn} />
        {widths.map((width, index) =>
          index === lastIndex ? (
            <Text key={index} style={[styles.totalCell, { width }]}>
              {table.total}
            </Text>
          ) : (
            <View key={index} style={{ width }} />
          ),
        )}
      </View>
    </View>
  );
}

function RentLine({ line }: { line: StatementRentLine }) {
  const bold = line.style === "line" ? {} : styles.bold;
  return (
    <View
      style={[
        styles.rentLine,
        line.style === "total" ? styles.rentTotalLine : {},
        line.style === "boxed" ? styles.rentBoxedLine : {},
      ]}
    >
      <Text style={[styles.rentLabel, bold]}>{line.label}</Text>
      <Text
        style={[
          styles.rentValue,
          line.style === "total" ? styles.rentTotalValue : {},
          line.style === "boxed" ? styles.rentBoxedValue : {},
        ]}
      >
        {line.value}
      </Text>
    </View>
  );
}

function StatementPage({ statement }: { statement: StatementDocument }) {
  return (
    <Page size="LETTER" style={styles.statementPage}>
      <Text style={styles.title}>{statement.title}</Text>
      <View>
        {statement.areas.map((area, index) => (
          <View key={index} style={styles.areaLine}>
            <Text style={styles.areaLabel}>{area.label}</Text>
            <Text style={styles.areaValue}>{area.value}</Text>
            <Text style={styles.areaUnit}>{area.unit}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.sectionHeading}>{statement.actualsHeading}</Text>
      <View>
        {statement.costLines.map((line, index) => (
          <View key={index} style={styles.costGroup}>
            <View style={styles.costLine}>
              <Text style={styles.costName}>{line.name}</Text>
              <Text style={styles.costAmount}>{line.actual}</Text>
              <View style={styles.costRates}>
                <Text style={styles.costRate}>{line.perYear}</Text>
                <Text style={styles.costRate}>{line.perMonth}</Text>
              </View>
            </View>
            {line.billNote ? (
              <Text style={styles.billNote}>{line.billNote}</Text>
            ) : null}
          </View>
        ))}
      </View>
      <Text style={styles.sectionHeading}>
        {statement.reconciliationHeading}
      </Text>
      <StatementTableView table={statement.table} />
      <View style={styles.rentBlock}>
        {statement.rentBlock.heading ? (
          <View style={styles.rentHeadingRow}>
            <Text style={styles.rentHeading}>
              {statement.rentBlock.heading}
            </Text>
            {statement.rentBlock.effective ? (
              <Text>{statement.rentBlock.effective}</Text>
            ) : null}
          </View>
        ) : null}
        {statement.rentBlock.lines.map((line, index) => (
          <RentLine key={index} line={line} />
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
