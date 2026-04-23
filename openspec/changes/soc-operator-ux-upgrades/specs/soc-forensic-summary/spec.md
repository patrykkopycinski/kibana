## ADDED Requirements

### Requirement: Per-case forensic summary

`.soc-forensic-summary` SHALL store one document per closed case containing: `case_id`, `closed_at`, `verdict` (enum: `true_positive`, `false_positive`, `benign_true_positive`, `inconclusive`), `iocs` (array of `{type, value, confidence}`), `yara_rules` (array of `{name, body, added_to_rules_index}`), `attribution` (object with `actor`, `campaign`, `ttps`), `exceptions_created` (array of `{rule_id, exception_id}`), `summary_markdown`.

#### Scenario: TP case captures IOCs and YARA
- **WHEN** a case closes with verdict `true_positive` and the investigation produced IOCs
- **THEN** the forensic-summary document MUST list those IOCs and any YARA rules created during the investigation

#### Scenario: FP case still produces summary
- **WHEN** a case closes with verdict `false_positive`
- **THEN** a forensic-summary document MUST be written with the FP verdict and any exceptions created

### Requirement: Case-close trigger

`soc-case-creation.yaml` SHALL, on transition of a case to `closed`, emit the forensic-summary document via `elasticsearch.index` with `op_type: create` keyed on `case_id` to ensure at-most-once write per case.

#### Scenario: Duplicate close does not create duplicate summary
- **WHEN** a case-close event is replayed for a case that already has a summary
- **THEN** the second attempt MUST fail with a version conflict and MUST NOT overwrite the existing document
