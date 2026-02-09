// a11y-critical : Function to merge errors for a11y-engine.
// Handles errors differently for check_errors and other errors.
// It also adds the target selector to the errors for better identification.

function mergeErrors(mergedErrors, frameErrors, frameSpec) {
  for (const [key, value] of Object.entries(frameErrors)) {
    if (key === 'check_errors') {
      if (!mergedErrors[key]) {
        mergedErrors[key] = {};
      }

      for (const [checkNameKey, checkNameValue] of Object.entries(value)) {
        // Add the target if not present. If present then append parents target.
        checkNameValue.forEach(checkNameValueError => {
          if (!checkNameValueError.target && frameSpec) {
            checkNameValueError.target = frameSpec?.selector;
          } else if (checkNameValueError.target && frameSpec) {
            checkNameValueError.target = [
              ...frameSpec.selector,
              ...checkNameValueError.target
            ];
          }
        });
        if (mergedErrors[key][checkNameKey]) {
          mergedErrors[key][checkNameKey].push(...checkNameValue);
        } else {
          mergedErrors[key][checkNameKey] = Array.isArray(checkNameValue)
            ? [...checkNameValue]
            : [checkNameValue];
        }
      }
    } else {
      // Add the target if not present. If present then append parents target.
      value.forEach(errorValue => {
        if (!errorValue.target && frameSpec) {
          errorValue.target = frameSpec?.selector;
        } else if (errorValue.target && frameSpec) {
          errorValue.target = [...frameSpec.selector, ...errorValue.target];
        }
      });
      if (mergedErrors[key]) {
        mergedErrors[key] = [...mergedErrors[key], ...value];
      } else {
        mergedErrors[key] = value;
      }
    }
  }

  return mergedErrors;
}

export default mergeErrors;
