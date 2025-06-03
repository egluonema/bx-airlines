(() => {
  document.getElementsByTagName('body')[0].classList.add('drawer-open');
  var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
  tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl)
  });

  const vertical = window.location.pathname.split('/')[1];

  initFontFields();
  initColorFields();
  initStringFields();
  initImageFields();

  document.getElementById('reset-all-settings').addEventListener('click', async ({ target }) => {
    
    if (confirm('Are you sure? All changes you\'ve made to the current vertical will be lost.')) {
      target.disabled = true;
      const response = await fetch(`/${vertical}/settings/reset`, {
        method: 'POST',
      });

      if (response.ok) {
        window.location.reload(true);
      }
    }
  });

  function initFontFields() {
    document.querySelectorAll('[data-editor-type="font"]').forEach(field => {
      field.addEventListener('change', ({target}) => {
        updateCssVariable(target.dataset.cssVariable, target.value);
        updateSettings(target.id, target.value);
      });
    });
  }

  function initColorFields() {
    document.querySelectorAll('[data-editor-type="color"]').forEach(field => {

      // Update page based on lower debounce when color change occures (not change event only fires when color popup is closed, so input is better)
      field.addEventListener('input', debounce(({target}) => {
        updateCssVariable(target.dataset.cssVariable, target.value);

        let checkedSelector;
        if (target.id === 'theme.primaryColor') {
          checkedSelector = '[value="var(--bxi-primary-color)"]:checked';
        } else if (target.id === 'theme.secondaryColor') {
          checkedSelector = '[value="var(--bxi-secondary-color)"]:checked';
        } else {
          return;
        }

        document.querySelectorAll(checkedSelector).forEach(checked => { 
          document.getElementById(checked.dataset.colorVariableFor).value = target.value
        });
      }));

      // This is done in a separate event listener so we can limit requests to the server via a higher debounce
      field.addEventListener('input', debounce(({target}) => {
        updateSettings(target.id, target.value);
      }, 500));
    });

    document.querySelectorAll('[data-color-variable-for]').forEach(field => {
      const associatedColorInput = document.getElementById(field.dataset.colorVariableFor);
      
      // If a field is checked on page load, set the color input appropriately
      if (field.checked) {
        associatedColorInput.disabled = true;
        switch(field.value) {
          case 'var(--bxi-primary-color)':
            associatedColorInput.value = document.getElementById('theme.primaryColor').value; // Set the color field to primary color so it's still representative
            break;
          case 'var(--bxi-secondary-color)':
            associatedColorInput.value = document.getElementById('theme.secondaryColor').value; // Set the color field to secondary color so it's still representative
            break;
          default:
            console.error('Unhandled color variable encountered');
            break;
        }
      }

      field.addEventListener('change', ({ target }) => {
        // Make sure other checkbox fields for current color are unchecked
        document.querySelectorAll(`[data-color-variable-for="${target.dataset.colorVariableFor}"]`).forEach(field => {
          if (field !== target) {
            field.checked = false;
          }
        });

        associatedColorInput.disabled = target.checked; // If a variable is selected, disable color field

        let hexValue;
        switch(target.value) {
          case 'var(--bxi-primary-color)':
            hexValue = document.getElementById('theme.primaryColor').value; // Set the color field to primary color so it's still representative
            break;
          case 'var(--bxi-secondary-color)':
            hexValue = document.getElementById('theme.secondaryColor').value; // Set the color field to secondary color so it's still representative
            break;
          default: 
            console.error('Unhandled color variable encountered');
            return;
        }

        if (target.checked) {
          associatedColorInput.value = hexValue;

          // If checked, use save the CSS variable name
          updateCssVariable(associatedColorInput.dataset.cssVariable, target.value);
          updateSettings(target.dataset.colorVariableFor, target.value);
        } else {
          // If unchecked, ensure last used hex value is saved
          updateCssVariable(associatedColorInput.dataset.cssVariable, hexValue);
          updateSettings(target.dataset.colorVariableFor, hexValue);
        }
        
      });
    });
  }

  function initStringFields() {
    document.querySelectorAll('[data-editor-type="string"]').forEach(field => {
      const affectedElement = document.querySelector(field.dataset.affectedElementSelector);

      field.addEventListener('focus', _ => {
        affectedElement.classList.add('editing-element');
      });

      field.addEventListener('blur', _ => {
        affectedElement.classList.remove('editing-element');
      });

      field.addEventListener('input', ({ target }) => {
        if (affectedElement) {
          if (affectedElement.tagName === 'INPUT') {
            affectedElement.placeholder = target.value;
          } else {
            affectedElement.innerText = target.value;
          }
        }
      });

      // This is done in a separate event listener so we can limit requests to the server via a higher debounce
      field.addEventListener('input', debounce(({target}) => {
        updateSettings(target.id, target.value);
      }, 500));
    });
  }

  function initImageFields() {
    document.querySelectorAll('[data-editor-type="image"]').forEach(field => {
      let storedValue = field.value;
      const saveBtn = field.nextElementSibling;
      const cancelBtn = saveBtn.nextElementSibling;
      
      let affectedElement = null;

      if (field.dataset.affectedElementSelector) {
        affectedElement = document.querySelector(field.dataset.affectedElementSelector);
      }

      if (affectedElement) {
        field.addEventListener('focus', _ => {
          affectedElement.classList.add('editing-element');
        });
  
        field.addEventListener('blur', _ => {
          affectedElement.classList.remove('editing-element');
        });
      }

      field.addEventListener('input', event => {
        const target = event.target;

        if (target.value === storedValue) {
          saveBtn.classList.add('d-none');
          cancelBtn.classList.add('d-none');
        } else {
          saveBtn.classList.remove('d-none');
          cancelBtn.classList.remove('d-none');
        }
      });

      field.addEventListener('keyup', event => {
        if (event.key === 'Enter' || event.keyCode === 13) {
          saveBtn.click();
        }
      });

      saveBtn.addEventListener('click', _ => {
        // Avoid running this block if Enter is pressed but value hasn't changed
        if (field.value === storedValue) {
          saveBtn.classList.add('d-none');
          return;
        }

        storedValue = field.value;

        if (affectedElement) {
          console.log(affectedElement);
          switch (affectedElement.tagName) {
            case 'LINK':
              affectedElement.href = storedValue;
              break;
            case 'IMG': 
              affectedElement.src = storedValue;
              break;
            default:
              if (affectedElement.style['background-image'] !== '') {
                affectedElement.style['background-image'] = `url('${storedValue}')`;
              } else {
                console.error('Unhandled img type');
              }
              break;
          }
        }

        updateSettings(field.id, storedValue);

        saveBtn.classList.add('d-none');
        cancelBtn.classList.add('d-none');
      });

      cancelBtn.addEventListener('click', _ => {
        field.value = storedValue;
        
        saveBtn.classList.add('d-none');
        cancelBtn.classList.add('d-none');
      });
    });
  }

  function updateCssVariable(variableName, value) {
    document.documentElement.style.setProperty(variableName, value);
  }

  function updateSettings(jsonPath, value) {
    fetch(`/${vertical}/settings`, {
      method: 'PUT',
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonPath: jsonPath, value: value}),
    });
  }

  function debounce(func, timeout = 100) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => func.apply(this, args), timeout);
    };
  }
})();