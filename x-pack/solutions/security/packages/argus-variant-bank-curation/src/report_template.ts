/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ProductionAlertCluster,
  ClusteringMetrics,
  ReportConfig,
  BehavioralSignature,
  RepresentativeExample,
} from './types';

/**
 * Render behavioral signature as HTML
 */
const renderBehavioralSignature = (signature: BehavioralSignature): string => {
  const sections: string[] = [];

  if (signature.command_pattern && signature.command_pattern.length > 0) {
    sections.push(`
      <div class="signature-section">
        <h4>Command Pattern</h4>
        <pre>${signature.command_pattern.map((cmd) => escapeHtml(cmd)).join('\n')}</pre>
      </div>
    `);
  }

  if (signature.file_operations && signature.file_operations.length > 0) {
    sections.push(`
      <div class="signature-section">
        <h4>File Operations</h4>
        <ul>
          ${signature.file_operations
            .map((op) => `<li><code>${escapeHtml(op.path)}</code> - ${op.action}</li>`)
            .join('')}
        </ul>
      </div>
    `);
  }

  if (signature.network_indicators && signature.network_indicators.length > 0) {
    sections.push(`
      <div class="signature-section">
        <h4>Network Indicators</h4>
        <ul>
          ${signature.network_indicators
            .map(
              (net) =>
                `<li>${net.protocol.toUpperCase()}:${net.port} (${net.direction})</li>`
            )
            .join('')}
        </ul>
      </div>
    `);
  }

  if (signature.registry_operations && signature.registry_operations.length > 0) {
    sections.push(`
      <div class="signature-section">
        <h4>Registry Operations</h4>
        <ul>
          ${signature.registry_operations
            .map((reg) => `<li><code>${escapeHtml(reg.key)}</code> - ${reg.operation}</li>`)
            .join('')}
        </ul>
      </div>
    `);
  }

  return sections.join('');
};

/**
 * Render representative examples as collapsible JSON
 */
const renderRepresentativeExamples = (examples: RepresentativeExample[]): string => {
  return `
    <div class="examples-section">
      <h4>Representative Samples (${examples.length})</h4>
      ${examples
        .map(
          (example, idx) => `
        <details class="example-detail">
          <summary>Sample ${idx + 1} - ${example['@timestamp']}</summary>
          <pre class="json-content">${escapeHtml(JSON.stringify(example, null, 2))}</pre>
        </details>
      `
        )
        .join('')}
    </div>
  `;
};

/**
 * Render a single cluster card
 */
const renderClusterCard = (cluster: ProductionAlertCluster, index: number): string => {
  const labelClass = cluster.label.toLowerCase();
  const similarityPercent = (cluster.similarity_to_existing * 100).toFixed(1);
  const silhouetteScore = cluster.clustering_metrics.silhouette_score.toFixed(3);

  return `
    <div class="cluster-card" id="cluster-${cluster.cluster_id}" data-cluster-id="${cluster.cluster_id}">
      <div class="cluster-header">
        <h3>
          <span class="cluster-number">#${index + 1}</span>
          <span class="technique-badge">${cluster.technique}</span>
          <span class="label-badge ${labelClass}">${cluster.label}</span>
        </h3>
        <div class="cluster-metadata">
          <span class="metadata-item">Cluster Size: ${cluster.size}</span>
          <span class="metadata-item">Similarity: ${similarityPercent}%</span>
          <span class="metadata-item">Silhouette: ${silhouetteScore}</span>
        </div>
      </div>

      <div class="cluster-body">
        <div class="behavioral-signature">
          <h4>Behavioral Signature</h4>
          ${renderBehavioralSignature(cluster.behavioral_signature)}
        </div>

        ${renderRepresentativeExamples(cluster.representative_examples)}

        <div class="review-section">
          <h4>Analyst Review</h4>
          <div class="review-controls">
            <label>
              <input type="radio" name="quality-${cluster.cluster_id}" value="APPROVED" />
              <span class="quality-label approved">✓ APPROVED</span>
            </label>
            <label>
              <input type="radio" name="quality-${cluster.cluster_id}" value="REJECTED" />
              <span class="quality-label rejected">✗ REJECTED</span>
            </label>
            <label>
              <input type="radio" name="quality-${cluster.cluster_id}" value="NEEDS_REFINEMENT" />
              <span class="quality-label needs-refinement">⚠ NEEDS REFINEMENT</span>
            </label>
          </div>
          <textarea
            class="review-rationale"
            placeholder="Provide rationale for your decision (required)..."
            data-cluster-id="${cluster.cluster_id}"
          ></textarea>
        </div>
      </div>
    </div>
  `;
};

/**
 * Generate full report HTML
 */
export const generateReportHTML = (
  clusters: ProductionAlertCluster[],
  metrics: ClusteringMetrics,
  config: ReportConfig
): string => {
  const newCount = metrics.clusters_by_label.NEW;
  const driftCount = metrics.clusters_by_label.DRIFT;
  const duplicateCount = metrics.clusters_by_label.DUPLICATE;
  const newPercent = ((newCount / metrics.total_clusters) * 100).toFixed(1);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ARGUS Variant Bank Candidate Review - ${config.quarter}</title>
  <style>
    :root {
      --color-primary: #0077cc;
      --color-success: #28a745;
      --color-warning: #ffc107;
      --color-danger: #dc3545;
      --color-bg: #f8f9fa;
      --color-border: #dee2e6;
      --color-text: #212529;
      --font-mono: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: var(--color-text);
      background-color: var(--color-bg);
      line-height: 1.6;
      padding: 20px;
    }

    .header {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 30px;
    }

    .header h1 {
      font-size: 2rem;
      margin-bottom: 10px;
    }

    .header p {
      color: #6c757d;
      font-size: 1rem;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }

    .metric-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid var(--color-primary);
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .metric-card h3 {
      font-size: 0.875rem;
      color: #6c757d;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .metric-card .value {
      font-size: 1.75rem;
      font-weight: bold;
      color: var(--color-primary);
    }

    .filters {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
      display: flex;
      gap: 15px;
      align-items: center;
      flex-wrap: wrap;
    }

    .filters label {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .cluster-card {
      background: white;
      padding: 25px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }

    .cluster-header {
      border-bottom: 2px solid var(--color-border);
      padding-bottom: 15px;
      margin-bottom: 20px;
    }

    .cluster-header h3 {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 1.25rem;
      flex-wrap: wrap;
    }

    .cluster-number {
      color: #6c757d;
      font-weight: normal;
    }

    .technique-badge {
      background: var(--color-primary);
      color: white;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .label-badge {
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .label-badge.new {
      background: #d1ecf1;
      color: #0c5460;
    }

    .label-badge.drift {
      background: #fff3cd;
      color: #856404;
    }

    .cluster-metadata {
      display: flex;
      gap: 20px;
      margin-top: 10px;
      font-size: 0.875rem;
      color: #6c757d;
    }

    .metadata-item {
      display: flex;
      align-items: center;
    }

    .signature-section {
      margin-bottom: 15px;
    }

    .signature-section h4 {
      font-size: 0.95rem;
      margin-bottom: 8px;
      color: #495057;
    }

    .signature-section pre {
      background: #f8f9fa;
      padding: 12px;
      border-radius: 4px;
      border-left: 3px solid var(--color-primary);
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 0.85rem;
    }

    .signature-section ul {
      list-style: none;
      padding-left: 0;
    }

    .signature-section li {
      padding: 6px 0;
      border-bottom: 1px solid var(--color-border);
    }

    .signature-section li:last-child {
      border-bottom: none;
    }

    .signature-section code {
      background: #f8f9fa;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--font-mono);
      font-size: 0.85rem;
    }

    .examples-section {
      margin: 20px 0;
    }

    .examples-section h4 {
      font-size: 0.95rem;
      margin-bottom: 10px;
      color: #495057;
    }

    .example-detail {
      margin: 10px 0;
      border: 1px solid var(--color-border);
      border-radius: 4px;
    }

    .example-detail summary {
      cursor: pointer;
      padding: 10px 15px;
      background: #f8f9fa;
      user-select: none;
      font-weight: 500;
    }

    .example-detail summary:hover {
      background: #e9ecef;
    }

    .json-content {
      padding: 15px;
      background: #282c34;
      color: #abb2bf;
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      margin: 0;
    }

    .review-section {
      margin-top: 25px;
      padding-top: 20px;
      border-top: 2px solid var(--color-border);
    }

    .review-section h4 {
      font-size: 1rem;
      margin-bottom: 15px;
      color: #495057;
    }

    .review-controls {
      display: flex;
      gap: 20px;
      margin-bottom: 15px;
      flex-wrap: wrap;
    }

    .review-controls label {
      display: flex;
      align-items: center;
      cursor: pointer;
      padding: 10px 15px;
      border: 2px solid var(--color-border);
      border-radius: 4px;
      transition: all 0.2s;
    }

    .review-controls label:hover {
      background: #f8f9fa;
    }

    .review-controls input[type="radio"] {
      margin-right: 8px;
    }

    .review-controls input[type="radio"]:checked + .quality-label.approved {
      color: var(--color-success);
      font-weight: bold;
    }

    .review-controls input[type="radio"]:checked + .quality-label.rejected {
      color: var(--color-danger);
      font-weight: bold;
    }

    .review-controls input[type="radio"]:checked + .quality-label.needs-refinement {
      color: var(--color-warning);
      font-weight: bold;
    }

    .review-rationale {
      width: 100%;
      min-height: 100px;
      padding: 12px;
      border: 1px solid var(--color-border);
      border-radius: 4px;
      font-family: inherit;
      font-size: 0.95rem;
      resize: vertical;
    }

    .review-rationale:focus {
      outline: none;
      border-color: var(--color-primary);
    }

    .actions-bar {
      position: sticky;
      bottom: 0;
      background: white;
      padding: 20px;
      border-top: 2px solid var(--color-border);
      box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 30px;
      border-radius: 8px 8px 0 0;
    }

    .progress-indicator {
      font-size: 1rem;
      color: #6c757d;
    }

    .btn {
      padding: 12px 24px;
      border: none;
      border-radius: 4px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-primary {
      background: var(--color-primary);
      color: white;
    }

    .btn-primary:hover {
      background: #0056b3;
    }

    .btn-secondary {
      background: #6c757d;
      color: white;
      margin-right: 10px;
    }

    .btn-secondary:hover {
      background: #5a6268;
    }

    .alert {
      padding: 15px 20px;
      border-radius: 4px;
      margin-bottom: 20px;
    }

    .alert-info {
      background: #d1ecf1;
      color: #0c5460;
      border-left: 4px solid #0077cc;
    }

    .alert-warning {
      background: #fff3cd;
      color: #856404;
      border-left: 4px solid #ffc107;
    }

    .hidden {
      display: none;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>ARGUS Variant Bank Candidate Review</h1>
    <p>Quarterly Refresh: <strong>${config.quarter}</strong></p>
    <p>Review Interface for Security Research Analysts</p>
  </div>

  <div class="alert alert-info">
    <strong>Review Instructions:</strong> Evaluate each <strong>NEW</strong> or <strong>DRIFT</strong> cluster to determine if it represents a genuine evasion technique.
    Label as <strong>APPROVED</strong> for high-quality patterns, <strong>REJECTED</strong> for noise or benign activity,
    or <strong>NEEDS REFINEMENT</strong> for borderline cases. Provide clear rationale for each decision.
  </div>

  <div class="metrics-grid">
    <div class="metric-card">
      <h3>Total Clusters</h3>
      <div class="value">${metrics.total_clusters}</div>
    </div>
    <div class="metric-card">
      <h3>NEW Clusters</h3>
      <div class="value">${newCount} (${newPercent}%)</div>
    </div>
    <div class="metric-card">
      <h3>DRIFT Clusters</h3>
      <div class="value">${driftCount}</div>
    </div>
    <div class="metric-card">
      <h3>Avg Silhouette</h3>
      <div class="value">${metrics.average_silhouette_score.toFixed(3)}</div>
    </div>
    <div class="metric-card">
      <h3>Techniques Covered</h3>
      <div class="value">${metrics.techniques_covered.length}</div>
    </div>
  </div>

  <div class="filters">
    <label>
      <input type="checkbox" id="filter-new" checked />
      Show NEW
    </label>
    <label>
      <input type="checkbox" id="filter-drift" checked />
      Show DRIFT
    </label>
    <label>
      <strong>Filter by technique:</strong>
      <select id="technique-filter">
        <option value="">All Techniques</option>
        ${metrics.techniques_covered
          .sort()
          .map((tech) => `<option value="${tech}">${tech}</option>`)
          .join('')}
      </select>
    </label>
  </div>

  <div id="clusters-container">
    ${clusters.map((cluster, idx) => renderClusterCard(cluster, idx)).join('')}
  </div>

  <div class="actions-bar">
    <div class="progress-indicator">
      Reviewed: <strong id="reviewed-count">0</strong> / ${clusters.length}
    </div>
    <div>
      <button class="btn btn-secondary" onclick="exportReviews()">Export Draft</button>
      <button class="btn btn-primary" onclick="submitReviews()">Submit Reviews</button>
    </div>
  </div>

  <script>
    const clustersData = ${JSON.stringify(clusters)};
    const config = ${JSON.stringify(config)};

    // Track reviews in localStorage
    const STORAGE_KEY = 'argus-variant-reviews-' + config.quarter;

    function loadStoredReviews() {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error('Failed to load stored reviews:', e);
        }
      }
      return {};
    }

    function saveReview(clusterId, quality, rationale) {
      const reviews = loadStoredReviews();
      reviews[clusterId] = {
        quality_label: quality,
        rationale: rationale,
        reviewed_at: new Date().toISOString(),
        analyst_email: 'analyst@' + config.analyst_sso_domain
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
      updateProgressIndicator();
    }

    function updateProgressIndicator() {
      const reviews = loadStoredReviews();
      document.getElementById('reviewed-count').textContent = Object.keys(reviews).length;
    }

    function restoreReviews() {
      const reviews = loadStoredReviews();
      Object.entries(reviews).forEach(([clusterId, review]) => {
        const radio = document.querySelector(\`input[name="quality-\${clusterId}"][value="\${review.quality_label}"]\`);
        if (radio) radio.checked = true;
        const textarea = document.querySelector(\`textarea[data-cluster-id="\${clusterId}"]\`);
        if (textarea) textarea.value = review.rationale;
      });
      updateProgressIndicator();
    }

    // Auto-save on change
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const clusterId = e.target.name.replace('quality-', '');
        const rationale = document.querySelector(\`textarea[data-cluster-id="\${clusterId}"]\`).value;
        if (rationale.trim()) {
          saveReview(clusterId, e.target.value, rationale);
        }
      });
    });

    document.querySelectorAll('textarea.review-rationale').forEach(textarea => {
      textarea.addEventListener('blur', (e) => {
        const clusterId = e.target.dataset.clusterId;
        const radio = document.querySelector(\`input[name="quality-\${clusterId}"]:checked\`);
        if (radio && e.target.value.trim()) {
          saveReview(clusterId, radio.value, e.target.value);
        }
      });
    });

    // Filters
    function applyFilters() {
      const showNew = document.getElementById('filter-new').checked;
      const showDrift = document.getElementById('filter-drift').checked;
      const techniqueFilter = document.getElementById('technique-filter').value;

      document.querySelectorAll('.cluster-card').forEach(card => {
        const clusterId = card.dataset.clusterId;
        const cluster = clustersData.find(c => c.cluster_id === clusterId);

        let show = true;
        if (!showNew && cluster.label === 'NEW') show = false;
        if (!showDrift && cluster.label === 'DRIFT') show = false;
        if (techniqueFilter && cluster.technique !== techniqueFilter) show = false;

        card.style.display = show ? 'block' : 'none';
      });
    }

    document.getElementById('filter-new').addEventListener('change', applyFilters);
    document.getElementById('filter-drift').addEventListener('change', applyFilters);
    document.getElementById('technique-filter').addEventListener('change', applyFilters);

    function exportReviews() {
      const reviews = loadStoredReviews();
      const blob = new Blob([JSON.stringify(reviews, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = \`argus-variant-reviews-\${config.quarter}-draft.json\`;
      a.click();
      URL.revokeObjectURL(url);
    }

    function submitReviews() {
      const reviews = loadStoredReviews();
      const reviewCount = Object.keys(reviews).length;

      if (reviewCount === 0) {
        alert('No reviews to submit. Please review at least one cluster.');
        return;
      }

      if (reviewCount < clustersData.length) {
        const confirmed = confirm(\`You have reviewed \${reviewCount} of \${clustersData.length} clusters. Submit anyway?\`);
        if (!confirmed) return;
      }

      // Validate all reviews have rationale
      const incomplete = Object.entries(reviews).filter(([_, r]) => !r.rationale || !r.rationale.trim());
      if (incomplete.length > 0) {
        alert(\`\${incomplete.length} reviews are missing rationale. Please provide rationale for all decisions.\`);
        return;
      }

      // Convert to review audit format
      const auditEntries = Object.entries(reviews).map(([clusterId, review]) => ({
        cluster_id: clusterId,
        analyst_email: review.analyst_email,
        action: review.quality_label.toLowerCase().replace('_', '_'),
        timestamp: review.reviewed_at,
        rationale: review.rationale
      }));

      // Download as JSONL
      const jsonl = auditEntries.map(e => JSON.stringify(e)).join('\\n');
      const blob = new Blob([jsonl], { type: 'application/x-ndjson' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = \`review_audit_\${config.quarter}.jsonl\`;
      a.click();
      URL.revokeObjectURL(url);

      alert(\`Successfully exported \${reviewCount} reviews. Upload the review_audit_\${config.quarter}.jsonl file to:\n\${config.staging_bucket_path}/quarter=\${config.quarter}/review_audit.jsonl\`);
    }

    // Restore reviews on load
    restoreReviews();
  </script>
</body>
</html>
  `;
};

/**
 * Escape HTML to prevent XSS
 */
const escapeHtml = (text: string): string => {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
};
