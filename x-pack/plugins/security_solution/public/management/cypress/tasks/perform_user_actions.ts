/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { recurse } from 'cypress-recurse';

export type ActionTypes = 'click' | 'input' | 'clear' | 'select';

export interface FormAction {
  type: ActionTypes;
  selector?: string;
  customSelector?: string;
  value?: string;
}

export const performUserActions = (actions: FormAction[]) => {
  for (const action of actions) {
    performAction(action);
  }
};

const performAction = (action: FormAction) => {
  const getElement = (): Cypress.Chainable<JQuery<HTMLElement>> => {
    if (action.customSelector) {
      return cy.get(action.customSelector);
    }
    return cy.getByTestSubj(action.selector || '');
  };

  if (action.type === 'click') {
    getElement().click();
  } else if (action.type === 'input') {
    getElement().type(action.value || '');
  } else if (action.type === 'clear') {
    getElement().clear();
  } else if (action.type === 'select') {
    recurse(
      (): Cypress.Chainable<string> => {
        const element = getElement();
        element.click();
        cy.get(`button[title="${action?.value as string}"]`).click();
        return element.invoke('text');
      },
      (inputValue: string) => inputValue.startsWith(`${action.value}`),
      { delay: 1000, limit: 50 }
    );
  }
};
