const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

// Elysia -> @sinclair/typebox: Metro elige la build ESM (.mjs) de TypeBox y la
// transformación a CJS de Babel rompe el módulo `Object` ("Cannot read properties of
// undefined (reading 'defineProperty')") al ejecutar la API. Forzamos la build CJS.
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolve ?? context.resolveRequest;
  if (moduleName === '@sinclair/typebox' || moduleName.startsWith('@sinclair/typebox/')) {
    return resolve({ ...context, unstable_conditionNames: ['require', 'default'] }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

// Uniwind debe ser el wrapper MÁS EXTERNO.
module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
