const { build } = require('esbuild');
const path = require('path');
const fs = require('fs');

// [a11y-core]: resolve ip-protection imports to real file in monorepo,
// or fall back to a stub when building axe-core standalone (CI).
const fingerprintFallback = {
  name: 'a11y-fingerprint-fallback',
  setup(pluginBuild) {
    pluginBuild.onResolve(
      { filter: /ip-protection\/utils\/fingerprint/ },
      args => {
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
