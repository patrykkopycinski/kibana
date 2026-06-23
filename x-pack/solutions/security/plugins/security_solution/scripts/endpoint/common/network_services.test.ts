/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import os from 'node:os';
import * as networkServices from './network_services';

jest.mock('node:os');

const mockedNetworkInterfaces = os.networkInterfaces as jest.MockedFunction<typeof os.networkInterfaces>;

describe('network_services', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isExcludedFleetHostIp', () => {
    it('excludes loopback, link-local, and common bridge subnets', () => {
      expect(networkServices.isExcludedFleetHostIp('127.0.0.1')).toBe(true);
      expect(networkServices.isExcludedFleetHostIp('169.254.1.1')).toBe(true);
      expect(networkServices.isExcludedFleetHostIp('192.168.139.3')).toBe(true);
      expect(networkServices.isExcludedFleetHostIp('172.17.0.1')).toBe(true);
      expect(networkServices.isExcludedFleetHostIp('192.168.1.4')).toBe(false);
    });
  });

  describe('getInterfacePriority', () => {
    it('prefers en0 over bridge interfaces', () => {
      expect(networkServices.getInterfacePriority('en0')).toBeGreaterThan(
        networkServices.getInterfacePriority('bridge100')
      );
      expect(networkServices.getInterfacePriority('en0')).toBeGreaterThan(
        networkServices.getInterfacePriority('docker0')
      );
    });
  });

  describe('getCandidateIpv4Addresses', () => {
    it('sorts LAN interfaces ahead of bridge interfaces', () => {
      mockedNetworkInterfaces.mockReturnValue({
        bridge100: [
          {
            address: '192.168.139.3',
            family: 'IPv4',
            internal: false,
            mac: 'aa',
            netmask: '255.255.255.0',
            cidr: '192.168.139.3/24',
          },
        ],
        en0: [
          {
            address: '192.168.1.4',
            family: 'IPv4',
            internal: false,
            mac: 'bb',
            netmask: '255.255.255.0',
            cidr: '192.168.1.4/24',
          },
        ],
      });

      expect(networkServices.getCandidateIpv4Addresses().map(({ address }) => address)).toEqual([
        '192.168.1.4',
      ]);
    });
  });

  describe('getLocalhostRealIpHeuristic', () => {
    it('returns the highest-priority candidate', () => {
      mockedNetworkInterfaces.mockReturnValue({
        en0: [
          {
            address: '192.168.1.4',
            family: 'IPv4',
            internal: false,
            mac: 'bb',
            netmask: '255.255.255.0',
            cidr: '192.168.1.4/24',
          },
        ],
      });

      expect(networkServices.getLocalhostRealIpHeuristic()).toBe('192.168.1.4');
    });
  });

  describe('pickFleetHostIpFromCandidates', () => {
    it('prefers an open probe, then a refused probe', async () => {
      const candidates = [
        { address: '192.168.252.1', interfaceName: 'bridge101' },
        { address: '192.168.1.4', interfaceName: 'en0' },
      ];

      const probe = async (host: string) => {
        if (host === '192.168.1.4') {
          return 'refused' as const;
        }

        return 'timeout' as const;
      };

      await expect(networkServices.pickFleetHostIpFromCandidates(candidates, 8220, probe)).resolves.toBe(
        '192.168.1.4'
      );
    });
  });

  describe('probeTcpReachability', () => {
    it('reports refused for a closed high port quickly', async () => {
      await expect(networkServices.probeTcpReachability('127.0.0.1', 59999, 500)).resolves.toBe(
        'refused'
      );
    });
  });
});
