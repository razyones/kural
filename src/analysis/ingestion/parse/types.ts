/**
 * Defines the structural vocabulary every module shares when
 * talking about code units. It is the only source of truth for what a parsed
 * type, function, file, or directory looks like — no other module invents
 * these shapes.
 */

/** Valid directions for the @kuralBound tag. */
export type BoundDirection = "inward" | "outward";

/** A single audit suppression annotation from @kuralResidual. */
export type ResidualEntry = {
  /** Which audit to suppress (e.g. "outliers", "merge-candidates") */
  audit: string;
  /** Optional structural hash — suppression breaks when code changes */
  hash?: string;
};

/** Parsed data from a @kuralBorrows directive in KURAL.md. */
export type BorrowsEntry = {
  /** Optional target module path for audit exclusion (e.g. "analysis/advise") */
  target?: string;
  /** Role description used as instruction prefix for name and description embeddings */
  role: string;
};

/**
 * Base properties shared by all code units in the codebase tree.
 */
export type KuralUnit = {
  /** Name of the unit (function name, type name, filename, folder name) */
  name: string;
  /** Absolute path to the unit's source location */
  path: string;
  /** Embedding of name + description — captures purpose */
  identityEmbedding: number[];
  /** Embedding of name + description + structure — captures shape */
  leafEmbedding: number[];
  /** Hash of all facet texts fed into embedding — used for cache invalidation */
  facetHash?: string;
};

/**
 * Internal and external imports from the containing file.
 * @kuralUtil
 */
export type ModuleImports = {
  /** Paths of other files imported within the same project */
  internalImports: string[];
  /** External package names imported (e.g. ["zod", "ai"]) */
  externalImports: string[];
};

/**
 * Its identity is its data shape — the embedding of
 * its field names and field types. Types represent declarative schemas:
 * named records with typed properties and cross-module references.
 */
export type KuralType = KuralUnit & {
  /** JSDoc description of the type's purpose */
  description?: string;
  /** Field names mapped to their types (e.g. { name: "string", posts: "Post[]" }) */
  fields: Record<string, string>;
  /** Whether the type is exported from its file */
  exported: boolean;
  /** Paths of cross-module types referenced in fields */
  references: string[];
  /** Whether the type is a utility helper for its file */
  util: boolean;
  /** Whether the type is a shared extraction helper */
  helper: boolean;
  /** Audit-specific suppression annotations from @kuralResidual */
  residuals: ResidualEntry[];
  /** Pattern group IDs from @kuralPatterns (supports nesting) */
  patterns?: string[];
  /** Bound direction from @kuralBound */
  bound?: BoundDirection;
  /** Structured symbol info from the Language Service */
  symbolInfo?: SymbolInfo;
};

/**
 * Its identity is its call signature — the
 * embedding of its parameter types and return type. Functions represent
 * executable transformations: inputs in, output out.
 */
export type KuralFunction = KuralUnit & {
  /** JSDoc description of the function's behavior */
  description?: string;
  /** Parameter types (e.g. ["User", "string"]) */
  params: string[];
  /** Parameter names from the AST (e.g. ["name", "age"]) */
  paramNames: string[];
  /** Return type (e.g. "Promise<User>") */
  returns: string;
  /** Whether the function is exported from its file */
  exported: boolean;
  /** Whether the function is annotated as pure */
  pure: boolean;
  /** Whether the function is a utility helper for its file */
  util: boolean;
  /** Whether the function is a shared extraction helper */
  helper: boolean;
  /** Audit-specific suppression annotations from @kuralResidual */
  residuals: ResidualEntry[];
  /** Describes what the function causes beyond its type signature */
  causes?: string;
  /** Names of cross-module functions called from the body */
  calls: string[];
  /** Pattern group IDs from @kuralPatterns (supports nesting) */
  patterns?: string[];
  /** Number of @param tags with non-empty descriptions */
  documentedParams: number;
  /** Whether a @returns tag with a non-empty description exists */
  hasReturnDoc: boolean;
  /** Bound direction from @kuralBound */
  bound?: BoundDirection;
  /** Structured symbol info from the Language Service */
  symbolInfo?: SymbolInfo;
};

/**
 * A source file containing functions and type declarations. Files are the
 * mid-level organizational unit: they group related leaves (functions, types)
 * and track dependency edges via internal and external imports.
 */
export type KuralFile = KuralUnit & {
  /** File-level JSDoc description */
  description?: string;
  /** Functions declared in this file, keyed by function name */
  functions: Record<string, KuralFunction>;
  /** Types declared in this file, keyed by type name */
  types: Record<string, KuralType>;
  /** Internal and external import dependencies */
  imports: ModuleImports;
  /** Companion group ID from @kuralCompanion */
  companion?: string;
  /** Bound direction from @kuralBound */
  bound?: BoundDirection;
  /** Audit-specific suppression annotations from file-level @kuralResidual */
  residuals: ResidualEntry[];
};

/**
 * A pure container for hierarchical organization. Directories group files
 * and subdirectories but contain no code. Their identity vector is their
 * name blended with the aggregate of their children's vectors, optionally
 * enriched by a human-written KURAL.md description.
 */
export type KuralDirectory = KuralUnit & {
  /** Paths of child files and subdirectories */
  children: string[];
  /** Directory description from KURAL.md */
  description?: string;
  /** Audit-specific suppression annotations from KURAL.md @kuralResidual lines */
  residuals: ResidualEntry[];
  /** Cross-layer borrowing declaration from @kuralBorrows */
  borrows?: BorrowsEntry;
};

/** Extracted contents of a single source file before embedding. */
export type ExtractedFile = {
  name: string;
  path: string;
  description?: string;
  functions: Record<string, KuralFunction>;
  types: Record<string, KuralType>;
  imports: ModuleImports;
  companion?: string;
  bound?: BoundDirection;
  residuals: ResidualEntry[];
};

/**
 * A single part of a symbol's display representation from the Language Service.
 */
export type DisplayPart = {
  /** The text content */
  text: string;
  /** Semantic kind: "keyword", "parameterName", "aliasName", "propertyName", etc. */
  kind: string;
};

/** A JSDoc tag extracted from a symbol. */
export type SymbolTag = {
  /** Tag name (e.g. "param", "returns") */
  name: string;
  /** Tag text content */
  text?: string;
};

/** Structured information about a code symbol from the Language Service. */
export type SymbolInfo = {
  /** Semantic display parts for the symbol's signature */
  displayParts: DisplayPart[];
  /** JSDoc documentation string */
  documentation: string;
  /** JSDoc tags */
  tags: SymbolTag[];
};
