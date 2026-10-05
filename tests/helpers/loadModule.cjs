const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const babel = require('@babel/core');

// Exercise the real modules with explicit native adapters; no Metro or device
// is implied by these tests. Babel is already part of the Expo toolchain.
function loadModule(filename, mocks = {}, cache = new Map()) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  cache.set(filename, module);
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs', ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }]],
  });
  const requireMock = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === 'react/jsx-runtime' && mocks.react) {
      const jsx = (type, props) => ({ type, props });
      return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    }
    if (name.startsWith('.')) return loadModule(localRequire.resolve(name), mocks, cache);
    return localRequire(name);
  };
  new Function('require', 'module', 'exports', '__DEV__', code)(requireMock, module, module.exports, false);
  return module.exports;
}
module.exports = { loadModule };
