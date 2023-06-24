/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MouseEventHandler } from 'react';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';
import type { LocationDescriptorObject } from 'history';

type EventHandlerCallback = MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;

/**
 * Provides an event handler that can be used with (for example) `onClick` props to prevent the
 * event's default behaviour and instead navigate to a route via the Router
 *
 * @param routeTo
 * @param onClick
 */
export const useNavigateByRouterEventHandler = (
  routeTo: string | [string, unknown] | LocationDescriptorObject<unknown>, // Cover the calling signature of `history.push()`

  /** Additional onClick callback */
  onClick?: EventHandlerCallback
): EventHandlerCallback => {
  const navigate = useNavigate();
  return useCallback(
    (ev) => {
      try {
        if (onClick) {
          onClick(ev);
        }
      } catch (error) {
        ev.preventDefault();
        throw error;
      }

      if (ev.defaultPrevented) {
        return;
      }

      if (ev.button !== 0) {
        return;
      }

      if (
        ev.currentTarget instanceof HTMLAnchorElement &&
        ev.currentTarget.target !== '' &&
        ev.currentTarget.target !== '_self'
      ) {
        return;
      }

      if (ev.metaKey || ev.altKey || ev.ctrlKey || ev.shiftKey) {
        return;
      }

      ev.preventDefault();

      if (Array.isArray(routeTo)) {
        navigate(...routeTo);
      } else if (typeof routeTo === 'string') {
        navigate(routeTo);
      } else {
        navigate(routeTo);
      }
    },
    [navigate, onClick, routeTo]
  );
};
