const { build } = require('esbuild');
const path = require('path');
const fs = require('fs');

// [a11y-core]: resolve ip-protection imports to real file in monorepo,
// or fall back to a stub when building axe-core standalone (CI).
// Set A11Y_FINGERPRINT_PATH env var to override the fingerprint module location.
const fingerprintFallback = {
  name: 'a11y-fingerprint-fallback',
  setup(pluginBuild) {
    pluginBuild.onResolve(
      { filter: /ip-protection\/utils\/fingerprint/ },
      args => {
        if (process.env.A11Y_FINGERPRINT_PATH) {
          const envPath = path.resolve(process.env.A11Y_FINGERPRINT_PATH);
          if (fs.existsSync(envPath)) {
            return { path: envPath };
          }
        }
        const realPath = path.resolve(args.resolveDir, args.path + '.js');
        if (fs.existsSync(realPath)) {
          return { path: realPath };
        }
        return {
          path: path.resolve(
            __dirname,
            '../../lib/core/utils/fingerprint-stub.js'
          )
        };
      }
    );
  }
};

module.exports = function (grunt) {
  grunt.registerMultiTask(
    'esbuild',
    'Task to run the esbuild javascript bundler',
    function () {
      const done = this.async();
      const files = grunt.task.current.data.files;

      files.forEach(file => {
        const src = Array.isArray(file.src) ? file.src : [file.src];
        const dest = file.dest;

        src.forEach(entry => {
          const name = path.basename(entry);
          if (file.cwd) {
            entry = path.join(file.cwd, entry);
          }

          build({
            entryPoints: [entry],
            outfile: path.join(dest, name),
            minify: false,
            format: 'esm',
            bundle: true,
            // [a11y-core]: inline bundled plain-text data assets as raw strings so
            // the client parses them at scan start with no runtime fetch. This
            // loader lives here (not only in a11y-engine-core) BY DESIGN:
            // a11y-engine-core/build/tasks/esbuild.js re-exports this exact task
            // (require('../../../axe-core/build/tasks/esbuild')), so this is the
            // loader that actually bundles a11y-engine-core/config/coi-denylist.txt
            // (imported by lib/commons/coi-denylist.js). Only affects `.txt`
            // imports; JS bundling is unchanged.
            loader: { '.txt': 'text' },
            plugins: [fingerprintFallback]
          })
            .then(done)
            .catch(e => {
              grunt.fail.fatal(e);
              done();
            });
        });
      });
    }
  );
};
