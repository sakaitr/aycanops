const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const ts = require("typescript");

// Load real application modules without starting Next or reading .env.
// Only framework session lookup is replaced by API tests; SQL remains real.
function createLoader(overrides = {}) {
  const root = path.resolve(__dirname, "../..");
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(root, file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const nativeRequire = createRequire(filename);
    function resolve(specifier) {
      if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
      const local = specifier.startsWith("@/")
        ? path.join(root, specifier.slice(2))
        : specifier.startsWith(".") ? path.resolve(path.dirname(filename), specifier) : null;
      if (local) {
        for (const candidate of [local, local + ".ts", local + ".tsx", local + "/index.ts"]) {
          if (/\.tsx?$/.test(candidate) && fs.existsSync(candidate)) return load(candidate);
        }
      }
      return nativeRequire(specifier);
    }
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    new Function("require", "module", "exports", "__filename", "__dirname", code)(
      resolve, module, module.exports, filename, path.dirname(filename),
    );
    return module.exports;
  }
  return load;
}
module.exports = { createLoader };
