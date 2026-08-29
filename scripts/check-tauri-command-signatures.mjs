import { readFileSync, readdirSync, statSync } from "node:fs";
import process from "node:process";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rustRoot = resolve(root, "src-tauri", "src");
const frontendRoot = resolve(root, "src");
const libRs = resolve(rustRoot, "lib.rs");

const snakeToCamel = (name) => name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

function walkFiles(dir, acceptedExtensions) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...walkFiles(path, acceptedExtensions));
    } else if (acceptedExtensions.has(extname(path))) {
      files.push(path);
    }
  }
  return files;
}

function findMatching(source, openIndex, openChar, closeChar, describeFor) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === openChar) depth += 1;
    else if (source[i] === closeChar) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error(`Unbalanced ${openChar}${closeChar} while scanning ${describeFor}`);
}

function splitTopLevel(source, separator = ",") {
  const parts = [];
  let start = 0;
  let angle = 0;
  let paren = 0;
  let bracket = 0;
  let brace = 0;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === "<") angle += 1;
    else if (char === ">") angle = Math.max(0, angle - 1);
    else if (char === "(") paren += 1;
    else if (char === ")") paren = Math.max(0, paren - 1);
    else if (char === "[") bracket += 1;
    else if (char === "]") bracket = Math.max(0, bracket - 1);
    else if (char === "{") brace += 1;
    else if (char === "}") brace = Math.max(0, brace - 1);
    else if (
      char === separator &&
      angle === 0 &&
      paren === 0 &&
      bracket === 0 &&
      brace === 0
    ) {
      parts.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }

  const tail = source.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function genericInner(type, wrapper) {
  const normalized = type.trim().replace(/^&(?:'[_a-zA-Z0-9]+\s*)?/, "").trim();
  const prefix = `${wrapper}<`;
  if (!normalized.startsWith(prefix) || !normalized.endsWith(">")) return null;
  return normalized.slice(prefix.length, -1).trim();
}

function unwrapRustResult(type) {
  const inner = genericInner(type, "Result");
  return inner === null ? type.trim() : splitTopLevel(inner)[0] ?? type.trim();
}

function rustShape(type) {
  let current = type.trim();
  let nullable = false;

  const option = genericInner(current, "Option");
  if (option !== null) {
    nullable = true;
    current = option;
    while (genericInner(current, "Option") !== null) {
      current = genericInner(current, "Option");
    }
  }

  if (genericInner(current, "Vec") !== null) return { category: "array", nullable };
  if (/^(?:String|&str|str)$/.test(current)) return { category: "string", nullable };
  if (/^bool$/.test(current)) return { category: "boolean", nullable };
  if (/^(?:[iu](?:8|16|32|64|128|size)|f(?:32|64))$/.test(current)) {
    return { category: "number", nullable };
  }
  if (current === "()") return { category: "void", nullable };
  return { category: "named", nullable };
}

function isInjectedRustArg(type) {
  return /(?:^|::)(?:State|AppHandle|Window|WebviewWindow)\s*(?:<|$)/.test(type.trim());
}

function registeredCommandNames() {
  const source = readFileSync(libRs, "utf8");
  const marker = "tauri::generate_handler![";
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Could not find ${marker} in src-tauri/src/lib.rs`);
  const open = source.indexOf("[", start);
  const close = findMatching(source, open, "[", "]", "tauri::generate_handler!");
  return splitTopLevel(source.slice(open + 1, close))
    .map((entry) => entry.split("::").at(-1)?.trim())
    .filter(Boolean);
}

function rustCommandSignatures() {
  const commands = new Map();
  const commandPattern =
    /#\s*\[\s*tauri::command(?:\s*\([^\]]*\))?\s*\]\s*(?:#\s*\[[^\]]+\]\s*)*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)/g;

  for (const file of walkFiles(rustRoot, new Set([".rs"]))) {
    const source = readFileSync(file, "utf8");
    let match;
    while ((match = commandPattern.exec(source)) !== null) {
      const name = match[1];
      const open = source.indexOf("(", match.index + match[0].length);
      if (open === -1) throw new Error(`Could not find args for Rust command ${name}`);
      const close = findMatching(source, open, "(", ")", `Rust command ${name}`);

      const args = splitTopLevel(source.slice(open + 1, close))
        .filter(Boolean)
        .map((parameter) => {
          const colon = parameter.indexOf(":");
          if (colon === -1) return null;
          const rawName = parameter.slice(0, colon).trim().replace(/^mut\s+/, "");
          const type = parameter.slice(colon + 1).trim();
          if (isInjectedRustArg(type)) return null;
          return {
            name: snakeToCamel(rawName),
            optional: genericInner(type, "Option") !== null,
            shape: rustShape(type),
            rustType: type,
          };
        })
        .filter(Boolean);

      let returnType = "()";
      const afterArgs = source.slice(close + 1);
      const arrow = afterArgs.match(/^\s*->\s*/);
      if (arrow) {
        const returnStart = close + 1 + arrow[0].length;
        let angle = 0;
        let paren = 0;
        let end = returnStart;
        for (; end < source.length; end += 1) {
          const char = source[end];
          if (char === "<") angle += 1;
          else if (char === ">") angle = Math.max(0, angle - 1);
          else if (char === "(") paren += 1;
          else if (char === ")") paren = Math.max(0, paren - 1);
          else if ((char === "{" || source.startsWith("where ", end)) && angle === 0 && paren === 0) {
            break;
          }
        }
        returnType = source.slice(returnStart, end).trim();
      }

      commands.set(name, {
        file: relative(root, file),
        args,
        result: rustShape(unwrapRustResult(returnType)),
        rustReturnType: returnType,
      });
    }
  }

  return commands;
}

function stripNullishTs(type) {
  if (!(type.flags & ts.TypeFlags.Union)) {
    return { type, nullable: Boolean(type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) };
  }

  const remaining = type.types.filter(
    (member) => !(member.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))
  );
  const nullable = remaining.length !== type.types.length;
  return { type: remaining.length === 1 ? remaining[0] : type, nullable };
}

function tsShape(checker, type) {
  const stripped = stripNullishTs(type);
  const value = stripped.type;

  if (value.flags & ts.TypeFlags.Void) return { category: "void", nullable: stripped.nullable };
  if (value.flags & ts.TypeFlags.Undefined) return { category: "void", nullable: true };
  if (value.flags & ts.TypeFlags.StringLike) return { category: "string", nullable: stripped.nullable };
  if (value.flags & ts.TypeFlags.NumberLike) return { category: "number", nullable: stripped.nullable };
  if (value.flags & ts.TypeFlags.BooleanLike) return { category: "boolean", nullable: stripped.nullable };
  if (checker.isArrayType(value) || checker.isTupleType(value)) {
    return { category: "array", nullable: stripped.nullable };
  }
  return { category: "named", nullable: stripped.nullable };
}

function tsCommandDescriptors() {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) throw new Error("Could not find tsconfig.json");

  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  }

  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checker = program.getTypeChecker();
  const descriptors = new Map();

  for (const sourceFile of program.getSourceFiles()) {
    if (
      sourceFile.isDeclarationFile ||
      !sourceFile.fileName.startsWith(frontendRoot + sep) ||
      sourceFile.fileName.includes(`${sep}__tests__${sep}`)
    ) {
      continue;
    }

    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "defineCommand" &&
        node.typeArguments?.length === 2 &&
        node.arguments.length >= 1 &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        const name = node.arguments[0].text;
        if (descriptors.has(name)) {
          throw new Error(
            `Duplicate defineCommand descriptor for "${name}" in ${relative(root, sourceFile.fileName)}`
          );
        }

        const argsType = checker.getTypeFromTypeNode(node.typeArguments[0]);
        const resultType = checker.getTypeFromTypeNode(node.typeArguments[1]);
        const argsAreUndefined = Boolean(
          argsType.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)
        );

        const args = argsAreUndefined
          ? []
          : checker.getPropertiesOfType(argsType).map((symbol) => {
              const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0] ?? node;
              const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
              return {
                name: symbol.getName(),
                optional:
                  Boolean(symbol.flags & ts.SymbolFlags.Optional) ||
                  Boolean(type.flags & ts.TypeFlags.Undefined) ||
                  (Boolean(type.flags & ts.TypeFlags.Union) &&
                    type.types.some((member) => Boolean(member.flags & ts.TypeFlags.Undefined))),
                shape: tsShape(checker, type),
                tsType: checker.typeToString(type),
              };
            });

        descriptors.set(name, {
          file: relative(root, sourceFile.fileName),
          args,
          result: tsShape(checker, resultType),
          tsResultType: checker.typeToString(resultType),
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return descriptors;
}

function compareCategory(commandName, label, rust, tsValue, failures) {
  if (
    rust.category !== "named" &&
    tsValue.category !== "named" &&
    rust.category !== tsValue.category
  ) {
    failures.push(
      `${commandName}: ${label} category differs (Rust ${rust.category}, TS ${tsValue.category})`
    );
  }

  if (rust.nullable && !tsValue.nullable) {
    failures.push(`${commandName}: ${label} is nullable/optional in Rust but not in TS`);
  }
}

const registered = registeredCommandNames();
const registeredSet = new Set(registered);
const rustCommands = rustCommandSignatures();
const tsCommands = tsCommandDescriptors();
const failures = [];

for (const name of registered) {
  const rust = rustCommands.get(name);
  const descriptor = tsCommands.get(name);

  if (!rust) {
    failures.push(`${name}: registered in generate_handler! but #[tauri::command] definition was not found`);
    continue;
  }
  if (!descriptor) {
    failures.push(
      `${name}: registered in Rust but has no defineCommand<Args, Result>("${name}") descriptor in src/**`
    );
    continue;
  }

  const rustArgs = new Map(rust.args.map((arg) => [arg.name, arg]));
  const tsArgs = new Map(descriptor.args.map((arg) => [arg.name, arg]));

  for (const [argName, rustArg] of rustArgs) {
    const tsArg = tsArgs.get(argName);
    if (!tsArg) {
      failures.push(
        `${name}: Rust arg "${argName}" (${rustArg.rustType}) is missing from TS args (${descriptor.file})`
      );
      continue;
    }

    if (rustArg.optional && !(tsArg.optional || tsArg.shape.nullable)) {
      failures.push(
        `${name}.${argName}: Rust Option<...> accepts omission/null but TS requires ${tsArg.tsType}`
      );
    }
    if (!rustArg.optional && tsArg.optional) {
      failures.push(
        `${name}.${argName}: Rust requires ${rustArg.rustType} but TS marks the argument optional (${tsArg.tsType})`
      );
    }

    compareCategory(name, `arg "${argName}"`, rustArg.shape, tsArg.shape, failures);
  }

  for (const [argName] of tsArgs) {
    if (!rustArgs.has(argName)) {
      failures.push(
        `${name}: TS args declare "${argName}" but the Rust command has no matching user-supplied argument`
      );
    }
  }

  compareCategory(name, "result", rust.result, descriptor.result, failures);
}

for (const [name, descriptor] of tsCommands) {
  if (!registeredSet.has(name)) {
    failures.push(
      `${name}: defineCommand descriptor exists in ${descriptor.file} but the command is not registered in tauri::generate_handler!`
    );
  }
}

if (failures.length > 0) {
  process.stderr.write(
    "Tauri Rust <-> TypeScript command signature drift detected:\n\n" +
      failures.map((line) => `  - ${line}`).join("\n") +
      "\n\nEvery registered command must use defineCommand<Args, Result>(), and argument names/optionality plus serializable container shapes must agree.\n"
  );
  process.exit(1);
}
