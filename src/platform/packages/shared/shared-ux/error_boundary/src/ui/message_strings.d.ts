/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export declare const errorMessageStrings: {
  page: {
    callout: {
      fatal: {
        title: () => string;
        body: () => string;
        showDetailsButton: () => string;
        pageReloadButton: () => string;
      };
      recoverable: {
        title: () => string;
        body: () => string;
        pageReloadButton: () => string;
      };
    };
  };
  section: {
    callout: {
      fatal: {
        title: (sectionName: string) => string;
        body: (sectionName: string) => string;
        showDetailsButton: () => string;
      };
      recoverable: {
        title: (sectionName: string) => string;
        body: (sectionName: string) => string;
        pageReloadButton: () => string;
      };
    };
  };
  details: {
    title: () => string;
    componentName: (errorComponentName: string) => string;
    closeButton: () => string;
    copyToClipboardButton: () => string;
  };
};
