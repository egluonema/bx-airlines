/**
 * This class is used to abstract the logic for getting information out the of the data attributes 
 * flow trigger elements and handling a couple UI interactions
 */ 
class FlowContainerWrapper {
  constructor(target) {
    this.targetEl = target;
  }

  // Return value in data-dv-flow
  get DvFlowType() {
    return this.targetEl.dataset.dvFlow;
  }

  // Return value in URL parameter definited in data-url-policy-id if available or data-policy-id
  get PolicyId() {
    return this.getUrlParameter(this.targetEl.dataset.urlPolicyId) || this.targetEl.dataset.policyId
  }

  // Return value in URL parameter definited in data-url-api-key if available or data-api-key
  get ApiKey() {
    return this.getUrlParameter(this.targetEl.dataset.urlApiKey) || this.targetEl.dataset.apiKey
  }

  // Return value in URL parameter definited in data-url-company-id if available or data-company-id
  get CompanyId() {
    return this.getUrlParameter(this.targetEl.dataset.urlCompanyId) || this.targetEl.dataset.companyId
  }

  // Return parameters for DV flow request, grabs static data-dv-param-<name> parameters from element and 
  // merges with result from data-request-params-factory
  async getDvRequestParams() {
    let factoryResult = {};

    if (this.ParameterFactory) {
      factoryResult = await bxi.callFunction(this.ParameterFactory);
    }

    return { ...this.getParamsFromElement(this.targetEl), ...factoryResult };
  }

  // Return true if data-hide-logo is present and 'true'
  get HideLogo() {
    return this.targetEl.dataset.hideLogo === 'true';
  }

  // Return name of function in the function registry to call when a flow successfully completes
  get SuccessCallback() {
    return this.targetEl.dataset.successCallback;
  }

  // Return name of function in the function registry to call when a flow results in an error
  get ErrorCallback() {
    return this.targetEl.dataset.errorCallback;
  }

  // Return name of function in the function registry to call when retreiving parameters to pass along with DV request
  get ParameterFactory() {
    return this.targetEl.dataset.parameterFactory;
  }

  /**
   * Get all data-dv-param-<parameter-name> attributes off element, these will default to PascalCase unless overriden by including a property
   * name prior to the value, e.g. "firstName::Joe"
   * 
   * @param {HTMLElement} target Element to get dv parameteres off of
   * @returns 
   */
  getParamsFromElement(target) {
    return Object.keys(target.dataset)
      .filter(key => key.startsWith('dvParam'))
      .reduce((params, key) => {
        let value = target.dataset[key];
        if (value.includes('::')) {
          const split = value.split('::');
          return { ...params, [split[0]]: split[1]};
        } else {
          return { ...params, [key.replace('dvParam', '')]: value };
        }
      }, {});
  }

  /**
   * Grab a URL parameter matching key
   * 
   * @param {string} key Url parameter  
   * @returns 
   */
  getUrlParameter(key) {
    return new URLSearchParams(window.location.search).get(key);
  }

  /**
   * Hide and clear the modal error
   */
  hideModalError() {
    let errorContainer = document.getElementById('modal-error');
    if (errorContainer) {
      errorContainer.classList.add('d-none');
      errorContainer.textContent = '';
    }
  }

  /**
   * Show an error message in the modal or static element
   * 
   * @param {string} message Error message to show in the modal
   */
  displayError(message) {
    let errorElement;

    if (this.DvFlowType === 'modal') {
      errorElement = document.getElementById('modal-error');
      errorElement.classList.remove('d-none');
    } else {
      const id = 'static-widget-error';
      errorElement = document.getElementById(id);

      if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.id = id;
        errorElement.classList.add('text-danger', 'text-center');
        this.targetEl.appendChild(errorElement);
      }
    }

    errorElement.textContent = message;
  }
}

export default FlowContainerWrapper;