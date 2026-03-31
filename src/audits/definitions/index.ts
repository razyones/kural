/**
 * The registry. Exports all audit definitions in display order.
 * Adding or removing an audit means editing this barrel file.
 */

/* eslint-disable max-dependencies */
import { bloatedDirectories, bloatedFiles } from "./bloated.ts";
import { incoherent, incoherentUtils } from "./incoherent.ts";
import type { AuditDefinition } from "../types.ts";
import containments from "./containments.ts";
import duplicateUtils from "./duplicate-utils.ts";
import duplicates from "./duplicates.ts";
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
  incoherent,
  incoherentUtils,
  duplicateUtils,
  vocabularyBleed,
  identityLanguage,
  incompleteDocs,
];

export { allAudits };
