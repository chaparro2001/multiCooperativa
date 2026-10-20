import path from 'node:path';

const MODULES_SEGMENT = `${path.sep}apps${path.sep}api${path.sep}src${path.sep}modules${path.sep}`;

/**
 * Locates a path inside apps/api/src/modules/<module>/...
 * Returns the module name and the path relative to the module root, or null.
 */
function locateInModules(absolutePath) {
  const start = absolutePath.indexOf(MODULES_SEGMENT);
  if (start === -1) return null;
  const [moduleName, ...rest] = absolutePath.slice(start + MODULES_SEGMENT.length).split(path.sep);
  if (!moduleName) return null;
  return { moduleName, inner: rest.join('/') };
}

const PUBLIC_ENTRY = /^(index(\.(ts|js))?)?$/;

/** Backend modules may only be imported through their public index.ts (ADR-002). */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'A backend module may only be imported through its index.ts',
    },
    schema: [],
    messages: {
      internalImport:
        "Import from inside module '{{target}}'. Use its public interface: modules/{{target}}/index.ts.",
    },
  },
  create(context) {
    const importer = locateInModules(context.filename);

    function check(node) {
      const source = node.source?.value;
      if (typeof source !== 'string' || !source.startsWith('.')) return;

      const resolved = path.resolve(path.dirname(context.filename), source);
      const target = locateInModules(resolved);
      if (!target) return;
      if (importer && importer.moduleName === target.moduleName) return;
      if (PUBLIC_ENTRY.test(target.inner)) return;

      context.report({
        node: node.source,
        messageId: 'internalImport',
        data: { target: target.moduleName },
      });
    }

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};
