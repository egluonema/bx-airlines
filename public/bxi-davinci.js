
import FlowContainerWrapper from '/js/flow-container-wrapper.js';
import initFunctionRegistry from '/js/function-registry.js';
import Logger from '/js/logger.js';
import registerFunctions from '/register-functions.js';

(async function () {
  const logger = new Logger(window._env_.BXI_DEBUG_LOGGING === 'true');
  initFunctionRegistry(logger);
  registerFunctions(logger);

  let activeWidget = null;
  let isStaticWidget = false;
  let modal = null;

  await checkContinueToken();

  const flowTriggers = document.querySelectorAll('[data-dv-flow]');
  flowTriggers.forEach(flowTrigger => {
    logger.log(`Configuring flow trigger ${flowTrigger.dataset.dvFlow} for element`, flowTrigger);
    switch (flowTrigger.dataset.dvFlow) {
      case "modal":
        flowTrigger.addEventListener('click', event => handleDvModalCallback(event.target, 'modal-widgetbox'));
        break;
      case "static":
        isStaticWidget = true;
        if (!activeWidget) {
          launchStaticWidget(flowTrigger);
        }
        break;
      default:
        logger.warn('Invalid flow trigger detected valid values for data-dv-flow are "modal" or "static"');
    }
  });

  async function checkContinueToken() {
    // Check for continueToken
    const urlParams = new URLSearchParams(window.location.search);
    const continueToken = urlParams.get('continueToken');
    if (continueToken) {
      window.history.replaceState({}, document.title, window.location.pathname);
      await handleContinueToken(continueToken);
    } else {
      // If there's no continueToken on page load we don't care about this
      sessionStorage.removeItem('bxi_runningPolicyId');
    }
  }
  
  async function handleContinueToken(continueToken) {
    const policyId = sessionStorage.getItem('bxi_runningPolicyId');
    if (policyId) {
      const el = document.querySelector(`[data-policy-id="${policyId}"]`);

      if (!el) {
        logger.warn(`Element with data-policy-id="${policyId}" was not found, flow could not be resumed`);
      }

      const wrapper = new FlowContainerWrapper(el);

      if (wrapper.DvFlowType === 'modal') {
        showModal(wrapper);
        await launchFlow(document.getElementById('modal-widgetbox'), wrapper, continueToken);
      } else if (wrapper.DvFlowType === 'static') {
        launchStaticWidget(el, continueToken);
      } else {
        logger.warn('Flow could not be continued, invalid data-dv-flow type encountered, valid values for data-dv-flow are "modal" or "static"');
      }
    } else {
      logger.warn('Flow could not be continued because there was no bxi_runningPolicyId in session storage');
    }
  }

  async function handleDvModalCallback(target, flowContainerId) {
    const widgetWrapper = new FlowContainerWrapper(target);

    if (!widgetWrapper.PolicyId) {
      throw Error('Policy ID is required to launch a flow.');
    }

    let buttonEventName = target.alt === 'Remix on glitch' ? target.alt : target.innerText;
    buttonEventName = buttonEventName.toLowerCase().split(' ').join('_') + '_clicked';
    
    window.bxi.sendAnalytics?.(buttonEventName);

    await launchFlow(document.getElementById(flowContainerId), widgetWrapper);

    showModal(widgetWrapper);
  }

  function showModal(widgetWrapper) {
    const modalEl = document.getElementById('dv-modal');
    if (widgetWrapper.HideLogo) {
      modalEl.classList.add('hide-vertical-logo');
    }

    modal = new bootstrap.Modal(modalEl, {});

    modalEl.addEventListener('hidden.bs.modal', listener);
    modal.show();

    function listener() {
      window.davinci.cleanup(activeWidget);
      widgetWrapper.hideModalError();
      activeWidget = null;
      modal = null;
      modalEl.removeEventListener('hidden.bs.modal', listener);
      sessionStorage.removeItem('bxi_runningPolicyId');

      if (widgetWrapper.HideLogo) {
        modalEl.classList.remove('hide-vertical-logo');
      }

      if (isStaticWidget) {
        launchStaticWidget();
      }
    }
  }

  function launchStaticWidget(widgetContainer, continueToken) {
    if (!widgetContainer) {
      widgetContainer = document.querySelector('[data-dv-flow="static"]');
    }

    const widgetWrapper = new FlowContainerWrapper(widgetContainer);

    if (!widgetWrapper.PolicyId) {
      throw Error('Policy ID is required to launch a flow.');
    }

    logger.log('Launching static flow');

    launchFlow(widgetContainer, widgetWrapper, continueToken);
  }

  async function launchFlow(flowContainer, widgetWrapper, continueToken) {
    if (activeWidget) {
      window.davinci.cleanup(activeWidget);
      activeWidget = null;
    }

    sessionStorage.setItem('bxi_runningPolicyId', widgetWrapper.PolicyId);

    let tokenEndpoint = '/dvtoken';

    const tokenParams = {
      apiKey: widgetWrapper.ApiKey,
      companyId: widgetWrapper.CompanyId,
      policyId: widgetWrapper.PolicyId,
      flowParameters: await widgetWrapper.getDvRequestParams(),
    };

    if (Object.keys(tokenParams.flowParameters).length === 0) {
      delete tokenParams.flowParameters;
    }

    logger.log('DaVinci request parameters', tokenParams);
    logger.log('Calling token endpoint', tokenEndpoint);

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(Object.keys(tokenParams).reduce((acc, key) => tokenParams[key] ? {...acc, [key]: tokenParams[key]} : acc, {})), // Remove null/undefined values
    });

    logger.log('Token response received', tokenResponse)
    
    const tokenData = await tokenResponse.json();
    logger.log('Token data parsed from response', tokenData);

    if (tokenResponse.status !== 200) {
      widgetWrapper.displayError(tokenData.error || 'An unkown error occured, see glitch server side logs for more details');
      logger.error('Token response was not successful', tokenResponse);
      return;
    }

    const dvWidgetProps = {
      config: {
        method: continueToken ? 'continueFlow' : 'runFlow',
        apiRoot: tokenData.apiRoot,
        accessToken: continueToken || tokenData.token,
        companyId: tokenData.companyId,
        policyId: widgetWrapper.PolicyId,
      },
      useModal: false,
      successCallback: async response => {
        logger.log('DaVinci flow successful', response);

        // If there is sessionToken, update the secure http only cookie via the server endpoint
        if (response.sessionToken && response.sessionTokenMaxAge) {      
          await fetch(`/setCookie?sessionToken=${response.sessionToken}&sessionTokenMaxAge=${response.sessionTokenMaxAge}`);
        }    

        if (widgetWrapper.SuccessCallback) {
          logger.log('SuccessCallback exists on widget wrapper');
          await bxi.callFunction(widgetWrapper.SuccessCallback, response);
        }
        
        modal?.hide();   
      },
      errorCallback: async error => {
        logger.error('DaVinci flow was not successful');
        sessionStorage.removeItem('bxi_runningPolicyId');
        if (widgetWrapper.ErrorCallback) {
          logger.log('ErrorCallback exists on widget wrapper');
          await bxi.callFunction(widgetWrapper.ErrorCallback, error);
        }
      }
    };

    logger.log('Rendering DV widget with request parameters', dvWidgetProps);
    window.davinci.skRenderScreen(flowContainer, dvWidgetProps);

    activeWidget = flowContainer;
  }
})();

