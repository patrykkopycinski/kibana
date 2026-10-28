/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { AiResponseScreenReaderStatus } from './ai_response_screen_reader_status';

const heartbeatRegion = () => screen.getAllByRole('status')[0];
const responseRegion = () => screen.getAllByRole('status')[1];

describe('AiResponseScreenReaderStatus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('response region', () => {
    it('announces the full response once loading ends and keeps the text stable across rerenders', () => {
      const { rerender } = render(<AiResponseScreenReaderStatus isLoading responseMessage="Hel" />);
      expect(responseRegion()).toHaveTextContent('');

      rerender(<AiResponseScreenReaderStatus isLoading={false} responseMessage="Hello there" />);
      expect(responseRegion()).toHaveTextContent('Assistant said: Hello there');

      rerender(<AiResponseScreenReaderStatus isLoading={false} responseMessage="Hello there" />);
      expect(responseRegion()).toHaveTextContent('Assistant said: Hello there');
    });

    it('announces nothing when loading ends without a response message', () => {
      const { rerender } = render(<AiResponseScreenReaderStatus isLoading />);

      rerender(<AiResponseScreenReaderStatus isLoading={false} />);
      expect(responseRegion()).toHaveTextContent('');
    });

    it('announces a response that arrives after loading has already ended', () => {
      const { rerender } = render(<AiResponseScreenReaderStatus isLoading />);

      rerender(<AiResponseScreenReaderStatus isLoading={false} />);
      expect(responseRegion()).toHaveTextContent('');

      rerender(<AiResponseScreenReaderStatus isLoading={false} responseMessage="Late answer" />);
      expect(responseRegion()).toHaveTextContent('Assistant said: Late answer');
    });

    it('announces nothing for a response that was already present on first render', () => {
      const { rerender } = render(
        <AiResponseScreenReaderStatus isLoading={false} responseMessage="Earlier answer" />
      );
      expect(responseRegion()).toHaveTextContent('');

      rerender(
        <AiResponseScreenReaderStatus isLoading={false} responseMessage="Earlier answer!" />
      );
      expect(responseRegion()).toHaveTextContent('');
    });

    it('clears the response region when a new response starts loading', () => {
      const { rerender } = render(<AiResponseScreenReaderStatus isLoading responseMessage="One" />);
      rerender(<AiResponseScreenReaderStatus isLoading={false} responseMessage="One" />);
      expect(responseRegion()).toHaveTextContent('Assistant said: One');

      rerender(<AiResponseScreenReaderStatus isLoading responseMessage="One" />);
      expect(responseRegion()).toHaveTextContent('');
    });

    it('uses the provided assistant name', () => {
      const { rerender } = render(
        <AiResponseScreenReaderStatus isLoading responseMessage="Hi" assistantName="Agent" />
      );
      expect(heartbeatRegion()).toHaveTextContent('Agent is generating a response.');

      rerender(
        <AiResponseScreenReaderStatus
          isLoading={false}
          responseMessage="Hi"
          assistantName="Agent"
        />
      );
      expect(responseRegion()).toHaveTextContent('Agent said: Hi');
    });
  });

  describe('generating heartbeat', () => {
    const advanceSeconds = (seconds: number) => {
      act(() => {
        jest.advanceTimersByTime(seconds * 1000);
      });
    };

    it('announces that the assistant is generating as soon as loading starts', () => {
      render(<AiResponseScreenReaderStatus isLoading />);
      expect(heartbeatRegion()).toHaveTextContent('Assistant is generating a response.');
    });

    it('announces nothing when it never loads', () => {
      render(<AiResponseScreenReaderStatus isLoading={false} />);
      advanceSeconds(60);
      expect(heartbeatRegion()).toHaveTextContent('');
    });

    it('changes the text on a 5s, 10s, 15s, ... backoff schedule', () => {
      render(<AiResponseScreenReaderStatus isLoading />);

      advanceSeconds(4);
      expect(heartbeatRegion()).toHaveTextContent('Assistant is generating a response.');
      advanceSeconds(1);
      expect(heartbeatRegion()).toHaveTextContent(
        'Assistant is still generating a response. 5 seconds elapsed.'
      );

      advanceSeconds(9);
      expect(heartbeatRegion()).toHaveTextContent('5 seconds elapsed.');
      advanceSeconds(1);
      expect(heartbeatRegion()).toHaveTextContent('15 seconds elapsed.');

      advanceSeconds(15);
      expect(heartbeatRegion()).toHaveTextContent('30 seconds elapsed.');
    });

    it('caps the interval at 30s', () => {
      render(<AiResponseScreenReaderStatus isLoading />);

      advanceSeconds(105);
      expect(heartbeatRegion()).toHaveTextContent('105 seconds elapsed.');

      advanceSeconds(29);
      expect(heartbeatRegion()).toHaveTextContent('105 seconds elapsed.');
      advanceSeconds(1);
      expect(heartbeatRegion()).toHaveTextContent('135 seconds elapsed.');

      advanceSeconds(30);
      expect(heartbeatRegion()).toHaveTextContent('165 seconds elapsed.');
    });

    it('clears the heartbeat and stops ticking when loading ends', () => {
      const { rerender } = render(<AiResponseScreenReaderStatus isLoading />);
      advanceSeconds(5);
      expect(heartbeatRegion()).toHaveTextContent('5 seconds elapsed.');

      rerender(<AiResponseScreenReaderStatus isLoading={false} />);
      expect(heartbeatRegion()).toHaveTextContent('');

      advanceSeconds(60);
      expect(heartbeatRegion()).toHaveTextContent('');
    });

    it('restarts the schedule from the beginning when loading starts again', () => {
      const { rerender } = render(<AiResponseScreenReaderStatus isLoading />);
      advanceSeconds(15);
      expect(heartbeatRegion()).toHaveTextContent('15 seconds elapsed.');

      rerender(<AiResponseScreenReaderStatus isLoading={false} />);
      rerender(<AiResponseScreenReaderStatus isLoading />);
      expect(heartbeatRegion()).toHaveTextContent('Assistant is generating a response.');

      advanceSeconds(5);
      expect(heartbeatRegion()).toHaveTextContent('5 seconds elapsed.');
    });
  });
});
