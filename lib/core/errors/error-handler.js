import A11yEngineError from './a11y-engine-error';
import ErrorTypes from './error-types';

const ErrorHandler = {
  /*
        Error Object Structure
        errors: {
            check_errors: {
                check_name_1: {
                    details: [err1, err2 ...]
                },
                check_name_2: {
                    details: [err3, err4 ...]
                },
            },
            metadata_error: {
                details: [err1, err2, ...]
            },
            configuration_error: {
                details: [err1, err2, ...]
            },
            runtime_error: {
                details: [err1, err2, ...]
            }
        }
    */
  errors: {},

  addCheckError(checkName = 'anonymous', err) {
    try {
      const error = this.errors[ErrorTypes.CHECK_ERROR]
        ? this.errors[ErrorTypes.CHECK_ERROR]
        : {};
      const checkerror = error[checkName] ? error[checkName] : [];
      if (err) {
        checkerror.push(new A11yEngineError(err.message, err.stack));
      }
      error[checkName] = checkerror;
      this.errors[ErrorTypes.CHECK_ERROR] = error;
    } catch (e) {
      console.error('A11y Engine Error - Error in addCheckError', e);
    }
  },

  getCheckErrors() {
    return this.errors[ErrorTypes.CHECK_ERROR];
  },

  clearErrors() {
    try {
      this.errors = {};
    } catch (err) {
      console.error('A11y Engine Error - Error in clearErrors', err);
    }
  },

  addNonCheckError(type, message, err) {
    try {
      const error = this.errors[type] ? this.errors[type] : [];
      if (err) {
        error.push(new A11yEngineError(message, err.stack));
      } else {
        error.push(new A11yEngineError(message));
      }

      this.errors[type] = error;
    } catch (e) {
      console.error('A11y Engine Error - Error in addNonCheckError', e);
    }
  }
};

export default ErrorHandler;
