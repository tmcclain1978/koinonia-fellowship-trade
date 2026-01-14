import { format } from "date-fns";

interface JournalEntry {
  id: string;
  entry_date: string;
  symbol: string | null;
  entry_type: string;
  content: string;
  emotions: string[] | null;
  tags: string[] | null;
  ai_analysis: string | null;
  ai_suggestions: string[] | null;
  analyzed_at: string | null;
}

export const exportToCSV = (entries: JournalEntry[], filename: string = "trading_journal") => {
  // CSV headers
  const headers = [
    "Date",
    "Symbol", 
    "Entry Type",
    "Content",
    "Emotions",
    "Tags",
    "AI Analysis",
    "AI Suggestions"
  ];

  // Convert entries to CSV rows
  const rows = entries.map(entry => [
    format(new Date(entry.entry_date), 'yyyy-MM-dd'),
    entry.symbol || "",
    entry.entry_type,
    // Escape content for CSV (handle commas, quotes, newlines)
    `"${(entry.content || "").replace(/"/g, '""').replace(/\n/g, ' ')}"`,
    entry.emotions?.join("; ") || "",
    entry.tags?.join("; ") || "",
    `"${(entry.ai_analysis || "").replace(/"/g, '""').replace(/\n/g, ' ')}"`,
    entry.ai_suggestions?.join("; ") || ""
  ]);

  // Combine headers and rows
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.join(","))
  ].join("\n");

  // Create and download file
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportToPDF = (entries: JournalEntry[], filename: string = "trading_journal") => {
  // Create a printable HTML document
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to export PDF');
    return;
  }

  const styles = `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        padding: 40px;
        color: #1a1a1a;
        line-height: 1.6;
      }
      .header {
        text-align: center;
        margin-bottom: 30px;
        padding-bottom: 20px;
        border-bottom: 2px solid #e5e7eb;
      }
      .header h1 { 
        font-size: 28px;
        color: #111827;
        margin-bottom: 8px;
      }
      .header p {
        color: #6b7280;
        font-size: 14px;
      }
      .stats {
        display: flex;
        justify-content: center;
        gap: 40px;
        margin-bottom: 30px;
        padding: 16px;
        background: #f9fafb;
        border-radius: 8px;
      }
      .stat {
        text-align: center;
      }
      .stat-value {
        font-size: 24px;
        font-weight: bold;
        color: #3b82f6;
      }
      .stat-label {
        font-size: 12px;
        color: #6b7280;
      }
      .entry {
        margin-bottom: 24px;
        padding: 20px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        page-break-inside: avoid;
      }
      .entry-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid #f3f4f6;
      }
      .entry-symbol {
        font-size: 18px;
        font-weight: bold;
        color: #3b82f6;
      }
      .entry-type {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 16px;
        font-size: 12px;
        font-weight: 500;
        text-transform: capitalize;
      }
      .type-trade { background: #dbeafe; color: #1d4ed8; }
      .type-lesson { background: #dcfce7; color: #15803d; }
      .type-observation { background: #fef3c7; color: #b45309; }
      .type-goal { background: #f3e8ff; color: #7c3aed; }
      .entry-date {
        font-size: 12px;
        color: #6b7280;
      }
      .entry-content {
        margin-bottom: 12px;
        white-space: pre-wrap;
      }
      .entry-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }
      .tag, .emotion {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
      }
      .emotion { background: #fef2f2; color: #dc2626; }
      .tag { background: #eff6ff; color: #2563eb; }
      .ai-section {
        margin-top: 16px;
        padding: 12px;
        background: #f0fdf4;
        border-radius: 6px;
        border-left: 3px solid #22c55e;
      }
      .ai-title {
        font-size: 12px;
        font-weight: 600;
        color: #15803d;
        margin-bottom: 8px;
      }
      .ai-content {
        font-size: 13px;
        color: #374151;
      }
      .footer {
        margin-top: 40px;
        text-align: center;
        font-size: 11px;
        color: #9ca3af;
      }
      @media print {
        body { padding: 20px; }
        .entry { page-break-inside: avoid; }
      }
    </style>
  `;

  const getTypeClass = (type: string) => {
    switch(type) {
      case 'trade': return 'type-trade';
      case 'lesson': return 'type-lesson';
      case 'observation': return 'type-observation';
      case 'goal': return 'type-goal';
      default: return '';
    }
  };

  const entriesHTML = entries.map(entry => `
    <div class="entry">
      <div class="entry-header">
        <div>
          ${entry.symbol ? `<span class="entry-symbol">${entry.symbol}</span>` : ''}
          <span class="entry-type ${getTypeClass(entry.entry_type)}">${entry.entry_type}</span>
        </div>
        <span class="entry-date">${format(new Date(entry.entry_date), 'MMMM d, yyyy')}</span>
      </div>
      <div class="entry-content">${entry.content}</div>
      ${(entry.emotions?.length || entry.tags?.length) ? `
        <div class="entry-meta">
          ${entry.emotions?.map(e => `<span class="emotion">${e}</span>`).join('') || ''}
          ${entry.tags?.map(t => `<span class="tag">#${t}</span>`).join('') || ''}
        </div>
      ` : ''}
      ${entry.ai_analysis ? `
        <div class="ai-section">
          <div class="ai-title">AI Insights</div>
          <div class="ai-content">${entry.ai_analysis.replace(/\n/g, '<br>').slice(0, 500)}${entry.ai_analysis.length > 500 ? '...' : ''}</div>
        </div>
      ` : ''}
    </div>
  `).join('');

  const tradeCount = entries.filter(e => e.entry_type === 'trade').length;
  const analyzedCount = entries.filter(e => e.ai_analysis).length;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Trading Journal Export</title>
      ${styles}
    </head>
    <body>
      <div class="header">
        <h1>Trading Journal</h1>
        <p>Exported on ${format(new Date(), 'MMMM d, yyyy')}</p>
      </div>
      <div class="stats">
        <div class="stat">
          <div class="stat-value">${entries.length}</div>
          <div class="stat-label">Total Entries</div>
        </div>
        <div class="stat">
          <div class="stat-value">${tradeCount}</div>
          <div class="stat-label">Trade Entries</div>
        </div>
        <div class="stat">
          <div class="stat-value">${analyzedCount}</div>
          <div class="stat-label">AI Analyzed</div>
        </div>
      </div>
      ${entriesHTML}
      <div class="footer">
        Generated by Koinonia Fellowship Trading Journal
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  
  // Wait for content to load then print
  printWindow.onload = () => {
    printWindow.print();
  };
};
