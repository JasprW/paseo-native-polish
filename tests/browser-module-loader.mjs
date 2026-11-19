import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

// Replace the host runtime imports while leaving the adapter and DOM behavior real.
export function createBrowserModuleLoader(transform = source => source) {
  const modules = new Map([
    ['react-native', moduleUrl('export const Platform = { OS: "web" };')],
    ['react', moduleUrl('export function useSyncExternalStore() {}')],
  ]);
  async function compile(url) {
    if (modules.has(url.href)) return modules.get(url.href);
    const { outputText } = ts.transpileModule(await readFile(url, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
    });
    let source = transform(outputText, url);
    for (const match of [...source.matchAll(/from ["']([^"']+)["']/g)]) {
      const specifier = match[1];
      const dependency = modules.get(specifier) ?? await compile(new URL(`${specifier}.ts`, url));
      source = source.replace(match[0], `from "${dependency}"`);
    }
    const compiled = moduleUrl(source);
    modules.set(url.href, compiled);
    return compiled;
  }
  return compile;
}

export const compileBrowserModule = createBrowserModuleLoader();
