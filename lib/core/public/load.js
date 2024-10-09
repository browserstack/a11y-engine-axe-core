/*global a11yEngine*/
import Audit from '../base/audit';
import cleanup from './cleanup';
import runRules from './run-rules';
import respondable from '../utils/respondable';
import nodeSerializer from '../utils/node-serializer';
import mergeErrors from '../utils/merge-errors';

/**
 * Sets up Rules, Messages and default options for Checks, must be invoked before attempting analysis
 * @param  {Object} audit The "audit specification" object
 * @private
 */
export default function load(audit) {
  axe._audit = new Audit(audit);
}

function runCommand(data, keepalive, callback) {
  var resolve = callback;
  var reject = function reject(err) {
    if (err instanceof Error === false) {
      err = new Error(err);
    }
    callback(err);
  };

  var context = (data && data.context) || {};
  if (context.hasOwnProperty('include') && !context.include.length) {
    context.include = [document];
  }
  var options = (data && data.options) || {};

  switch (data.command) {
    case 'rules':
      return runRules(
        context,
        options,
        (results, cleanupFn) => {
          // Serialize all DqElements
          results = nodeSerializer.mapRawResults(results);

          //a11y-engine iframe rules error merging logic
          const errors = a11yEngine.getErrors();
          if (Object.keys(errors).length !== 0) {
            if (
              results.length > 0 &&
              results[results.length - 1]?.a11yEngineErrors
            ) {
              const error = results.pop();
              delete error.a11yEngineErrors;
              const mergedErrors = mergeErrors(error, errors);
              results.push({ ...mergedErrors, a11yEngineErrors: true });
            } else {
              results.push({ ...errors, a11yEngineErrors: true });
            }
          }
          a11yEngine.clearErrors();

          resolve(results);
          // Cleanup AFTER resolve so that selectors can be generated
          cleanupFn();
        },
        reject
      );
    case 'cleanup-plugin':
      return cleanup(resolve, reject);
    default:
      // go through the registered commands
      if (
        axe._audit &&
        axe._audit.commands &&
        axe._audit.commands[data.command]
      ) {
        return axe._audit.commands[data.command](data, callback);
      }
  }
}

if (window.top !== window) {
  respondable.subscribe('axe.start', runCommand);
  respondable.subscribe('axe.ping', (data, keepalive, respond) => {
    respond({
      axe: true
    });
  });
}
