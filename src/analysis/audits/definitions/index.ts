/**
 * The roster. Assembles every detection rule and its formatting
 * function into display order. It is the only module that decides
 * which rules run and in what sequence they appear in output.
 */

/* eslint-disable max-dependencies, sort-imports */
import { bloatedDirectories, bloatedFiles } from "./bloated.ts";
import { incoherent, incoherentUtils } from "./incoherent.ts";
import type { AuditDefinition } from "../types.ts";
import containments from "./containments.ts";
import duplicates, { utilDuplicates as duplicateUtils } from "./duplicates.ts";
import focalDrift from "./focal-drift.ts";
import identityLanguage from "./identity-language.ts";
import incompleteDocs from "./incomplete-docs.ts";
import mergeCandidates from "./merge-candidates.ts";
import misplaced from "./misplaced.ts";
import outliers from "./outliers.ts";
import vocabularyBleed from "./vocabulary-bleed.ts";

/** All audits in display order. */
const allAudits: AuditDefinition[] = [
  bloatedDirectories,
  bloatedFiles,
  outliers,
  mergeCandidates,
  misplaced,
  duplicates,
  containments,
  focalDrift,
  incoherent,
  incoherentUtils,
  duplicateUtils,
  vocabularyBleed,
  identityLanguage,
  incompleteDocs,
];

export { allAudits };
