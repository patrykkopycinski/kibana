/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * `data-test-subj` values owned by the app header, shared between the components and test consumers
 * to prevent drift. Covers the structural slots and the static menu items the header injects
 * (documentation, feedback, add integrations); caller-provided tabs, badges, and `menu` items are not.
 */
export declare const APP_HEADER_TEST_SUBJECTS: {
  readonly root: 'appHeader';
  readonly title: 'appHeaderTitle';
  readonly titleInput: 'appHeaderTitleInput';
  readonly titleError: 'appHeaderTitleError';
  readonly titleButton: 'appHeaderTitleButton';
  readonly titleActions: 'appHeaderTitleActions';
  readonly badge: 'appHeaderBadge';
  readonly sharePrefix: 'appHeaderShare';
  readonly shareButton: 'shareTopNavButton';
  readonly favorite: 'appHeaderFavorite';
  readonly favoriteButton: 'appHeaderFavoriteButton';
  readonly description: 'appHeaderDescription';
  readonly metadata: 'appHeaderMetadata';
  readonly tabs: 'appHeaderTabs';
  readonly badgesOverflow: 'appHeaderBadgesOverflow';
  readonly back: 'appHeaderBack';
  readonly skeleton: 'appHeaderSkeleton';
  readonly menuDocumentation: 'appHeaderMenuDocumentation';
  readonly menuFeedback: 'appHeaderMenuFeedback';
  readonly menuAddIntegrations: 'appHeaderMenuAddIntegrations';
};
