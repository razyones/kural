/** The dissector. Breaks a source file into structural parts — the only module that reads AST nodes. */

import type {
  BoundDirection,
  KuralFunction,
  KuralType,
  ModuleImports,
  ResidualEntry,
} from "./types.ts";
import { getJSDoc, hasExportModifier, isUtilModule } from "./jsdoc.ts";
import type { JSDocInfo } from "./jsdoc.ts";
import { basename } from "node:path";
import { readFileSync } from "node:fs";
import ts from "typescript";

/** Extracted contents of a single source file before embedding. */
type ExtractedFile = {
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

const EMPTY_EMBEDDING: number[] = [];

const FIRST = 0;
const AFTER_FIRST = 1;
const NO_LEAVES = 0;
const INDEX_FILENAME = "index.ts";

/** Fallback JSDocInfo for files with no statements. */
const EMPTY_JSDOC: JSDocInfo = {
  pure: false,
  util: false,
  helper: false,
  residuals: [],
  documentedParams: 0,
  hasReturnDoc: false,
};

/**
 * Converts a function declaration AST node into a KuralFunction.
 * @param node - The function declaration AST node
 * @param filePath - Absolute path to the source file
 * @returns A KuralFunction with params, return type, JSDoc tags, and calls
 * @kuralPure
 */
function extractFunction(node: ts.FunctionDeclaration, filePath: string): KuralFunction {
  const name = node.name?.text ?? "";
  const jsdoc = getJSDoc(node);
  const exported = hasExportModifier(node);

  const params: string[] = [];
  const paramNames: string[] = [];
  for (const param of node.parameters) {
    paramNames.push(param.name.getText());
    params.push(param.type ? param.type.getText() : "unknown");
  }

  const returns = node.type ? node.type.getText() : "void";
  const calls = extractCalls(node);

  return {
    name,
    path: filePath,
    identityEmbedding: EMPTY_EMBEDDING,
    leafEmbedding: EMPTY_EMBEDDING,
    description: jsdoc.description,
    params,
    paramNames,
    returns,
    exported,
    pure: jsdoc.pure,
    util: jsdoc.util,
    helper: jsdoc.helper,
    residuals: jsdoc.residuals,
    causes: jsdoc.causes,
    calls,
    patterns: jsdoc.patterns,
    documentedParams: jsdoc.documentedParams,
    hasReturnDoc: jsdoc.hasReturnDoc,
    bound: jsdoc.bound,
  };
}

/**
 * Builds a KuralType from pre-extracted fields and an AST node's metadata.
 * Shared by type alias and interface extraction paths.
 * @param node - The type alias or interface declaration AST node
 * @param fields - Pre-extracted field names mapped to their type strings
 * @param filePath - Absolute path to the source file
 * @param imports - Resolved imports from the containing file
 * @returns A KuralType with fields, references, and JSDoc tags
 * @kuralPure
 */
function buildKuralType(
  node: ts.TypeAliasDeclaration | ts.InterfaceDeclaration,
  fields: Record<string, string>,
  filePath: string,
  imports: ModuleImports,
): KuralType {
  const jsdoc = getJSDoc(node);

  return {
    name: node.name.text,
    path: filePath,
    identityEmbedding: EMPTY_EMBEDDING,
    leafEmbedding: EMPTY_EMBEDDING,
    description: jsdoc.description,
    fields,
    exported: hasExportModifier(node),
    references: extractFieldReferences(fields, imports),
    util: jsdoc.util,
    helper: jsdoc.helper,
    residuals: jsdoc.residuals,
    patterns: jsdoc.patterns,
    bound: jsdoc.bound,
  };
}

/**
 * Extracts property names and their type annotations from a node with members.
 * Works for both type literals and interface declarations.
 * @param node - AST node containing property signature members
 * @returns Field names mapped to their type strings
 * @kuralPure
 */
function extractFields(node: ts.TypeLiteralNode | ts.InterfaceDeclaration): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const member of node.members) {
    if (ts.isPropertySignature(member) && member.type) {
      const name = member.name.getText();
      fields[name] = member.type.getText();
    }
  }

  return fields;
}

/**
 * Collects internal and external import specifiers from a source file.
 * @param sourceFile - The parsed source file AST
 * @returns Internal (relative path) and external (package name) imports
 * @kuralPure
 */
function extractImports(sourceFile: ts.SourceFile): ModuleImports {
  const internalImports: string[] = [];
  const externalImports: string[] = [];

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;

      if (specifier.startsWith(".") || specifier.startsWith("/")) {
        internalImports.push(specifier);
      } else {
        externalImports.push(specifier);
      }
    }
  });

  return { internalImports, externalImports };
}

/**
 * Uppercases the first character of a string.
 * @param str - The string to capitalize
 * @returns The string with its first character uppercased
 * @kuralPure
 * @kuralUtil
 */
function capitalizeFirst(str: string): string {
  return str.charAt(FIRST).toUpperCase() + str.slice(AFTER_FIRST);
}

/**
 * Resolves which internal import paths are referenced by a type's fields.
 * Matches capitalized filenames from import paths against field type strings.
 * @param fields - Field names mapped to their type strings
 * @param imports - Resolved imports from the containing file
 * @returns Deduplicated internal import paths referenced in the fields
 * @kuralPure
 */
function extractFieldReferences(fields: Record<string, string>, imports: ModuleImports): string[] {
  const references: string[] = [];
  const importedNames = new Map<string, string>();

  for (const path of imports.internalImports) {
    const match = path.match(/\/([^/]+)\.ts$/);
    if (match) {
      importedNames.set(capitalizeFirst(match[AFTER_FIRST]), path);
    }
  }

  for (const fieldType of Object.values(fields)) {
    for (const [typeName, path] of importedNames) {
      if (fieldType.includes(typeName) && !references.includes(path)) {
        references.push(path);
      }
    }
  }

  return references;
}

/**
 * Collects names of functions called within a function body.
 * @param node - The function declaration AST node to traverse
 * @returns Deduplicated names of called functions
 * @kuralPure
 */
function extractCalls(node: ts.FunctionDeclaration): string[] {
  const calls: string[] = [];
  function visit(child: ts.Node): void {
    if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) {
      const name = child.expression.text;
      if (!calls.includes(name)) {
        calls.push(name);
      }
    }
    ts.forEachChild(child, visit);
  }
  if (node.body) {
    ts.forEachChild(node.body, visit);
  }
  return calls;
}

/**
 * Reads a TypeScript source file and extracts its types, functions, and imports.
 * @param filePath - Absolute path to the .ts file to extract
 * @returns Extracted file with name, types, functions, imports, and description
 * @kuralCauses Reads a source file from disk via readFileSync
 */
function extractFile(filePath: string): ExtractedFile {
  let sourceText: string;
  try {
    sourceText = readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(
      `Failed to read source file ${filePath}: ${err instanceof Error ? err.message : err}`,
    );
  }
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

  const functions: Record<string, KuralFunction> = {};
  const types: Record<string, KuralType> = {};
  const imports = extractImports(sourceFile);
  const fileJSDoc =
    sourceFile.statements.length === FIRST ? EMPTY_JSDOC : getJSDoc(sourceFile.statements[FIRST]);
  const moduleIsUtil = isUtilModule(filePath, fileJSDoc);

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const fn = extractFunction(node, filePath);
      fn.util = fn.util || moduleIsUtil;
      functions[fn.name] = fn;
    }

    if (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)) {
      const type = buildKuralType(node, extractFields(node.type), filePath, imports);
      type.util = type.util || moduleIsUtil;
      types[type.name] = type;
    }

    if (ts.isInterfaceDeclaration(node)) {
      const type = buildKuralType(node, extractFields(node), filePath, imports);
      type.util = type.util || moduleIsUtil;
      types[type.name] = type;
    }
  });

  // Auto-detect: index.ts with no functions or types is an inward-bound barrel export
  const isBarrelExport =
    basename(filePath) === INDEX_FILENAME &&
    Object.keys(functions).length === NO_LEAVES &&
    Object.keys(types).length === NO_LEAVES;
  const bound = fileJSDoc.bound ?? (isBarrelExport ? "inward" : undefined);

  return {
    name: basename(filePath),
    path: filePath,
    description: fileJSDoc.description,
    functions,
    types,
    imports,
    companion: fileJSDoc.companion,
    bound,
    residuals: fileJSDoc.residuals,
  };
}

export { extractFile };
export type { ExtractedFile };
