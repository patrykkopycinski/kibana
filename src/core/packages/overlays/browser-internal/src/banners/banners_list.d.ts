/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import type { Observable } from 'rxjs';
import type { OverlayBanner } from './banners_service';
interface Props {
  banners$: Observable<OverlayBanner[]>;
}
/**
 * BannersList is a list of "banners". A banner something that is displayed at the top of Kibana that may or may not
 * disappear.
 *
 * Whether or not a banner can be closed is completely up to the author of the banner. Some banners make sense to be
 * static, such as banners meant to indicate the sensitivity (e.g., classification) of the information being
 * represented.
 */
export declare const BannersList: React.FunctionComponent<Props>;
export {};
